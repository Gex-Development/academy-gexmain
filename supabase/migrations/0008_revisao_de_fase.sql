-- Revisão de fase 2 (whole-branch review): quatro achados visíveis só
-- olhando as oito tarefas juntas, nenhum visível numa revisão tarefa a
-- tarefa isolada.

-- ---------------------------------------------------------------------
-- 1. can_manage_course e can_manage_area respondiam quase a mesma pergunta
-- sem nada ligando as duas — can_manage_course reimplementava "admin, ou
-- líder da área do curso" na mão, em vez de reaproveitar can_manage_area
-- (que já existe desde 0007 exatamente para isso). Uma cópia sem vínculo
-- convida a divergir na próxima edição. Redefine can_manage_course em
-- termos de can_manage_area — mesmo caso do curso inexistente incluído: se
-- p_course_id não bate com linha nenhuma, o EXISTS já é falso, igual antes.
-- ---------------------------------------------------------------------
create or replace function public.can_manage_course(p_course_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.courses c
    where c.id = p_course_id and public.can_manage_area(c.area_id)
  );
$$;

-- ---------------------------------------------------------------------
-- 2. progresso_proprio (lesson_progress) checava só "user_id = auth.uid()
-- e auth_is_active()" — a foreign key era o único outro freio. Isso deixa
-- qualquer colaborador ativo gravar linha de progresso em QUALQUER aula,
-- inclusive de curso ao qual não tem acesso nenhum. Não é vazamento de
-- confidencialidade (a linha não expõe conteúdo), mas é perda de
-- integridade: progresso_gestao entrega essas linhas ao gestor do curso da
-- aula, então um líder passaria a ver "progresso" em aulas de fora da sua
-- área, criado por gente que nunca deveria ter acesso a elas — a fase 3
-- constrói tanto o rastreamento de progresso quanto o painel do líder em
-- cima desta tabela.
--
-- Correção só no WITH CHECK (regula o que pode ser GRAVADO — INSERT e o
-- lado de escrita de UPDATE): exige can_access_course(l.course_id) da aula
-- referenciada. O USING (o que a pessoa pode ENXERGAR/apagar da própria
-- linha) fica como estava — se o acesso de alguém a um curso for revogado
-- depois de já ter progresso registrado lá, a pessoa continua vendo/
-- apagando o próprio histórico; não é o alvo deste achado.
-- ---------------------------------------------------------------------
drop policy progresso_proprio on public.lesson_progress;
create policy progresso_proprio on public.lesson_progress
  for all to authenticated
  using (user_id = auth.uid() and public.auth_is_active())
  with check (
    user_id = auth.uid()
    and public.auth_is_active()
    and exists (
      select 1 from public.lessons l
      where l.id = lesson_id and public.can_access_course(l.course_id)
    )
  );

-- ---------------------------------------------------------------------
-- 3. courses_escrita (0007) não travava owner_id nenhum: WITH CHECK só
-- exigia can_manage_area(area_id). Um líder podia fazer PATCH em
-- courses.owner_id do próprio curso e apontar para qualquer profile id — a
-- fase 3 usa esse campo para notificar por e-mail o dono do curso quando
-- alguém pergunta no fórum (corpo da pergunta, títulos de curso/aula e link
-- direto incluídos). Sem este freio, um líder vira canal para empurrar
-- conteúdo para qualquer colaborador, sem esse colaborador gerenciar nada.
-- Não explorável antes da fase 3 existir, mas o freio pertence à migration
-- que introduziu o campo sem travá-lo.
--
-- curso_mantem_owner segue a MESMA técnica de pergunta_mantem_chaves/
-- resposta_mantem_chaves (0006/0007): uma função SECURITY DEFINER, porque
-- uma subconsulta autocorrelacionada direto no WITH CHECK de courses reabre
-- `courses`, o que reavalia as políticas da própria tabela para decidir
-- quais linhas a subconsulta enxerga, o que reabre a subconsulta de novo —
-- 42P17, recursão infinita (0006 documenta o mesmo erro batendo em
-- questions/answers). SECURITY DEFINER roda como o dono da função, que não
-- está sujeito à RLS da própria tabela por padrão, e por isso não recursiona.
--
-- "not exists (... owner_id <> p_owner_id)" cobre os dois casos com a MESMA
-- expressão: se a linha ainda não existe (INSERT — a trilha de criação já
-- fixa owner_id = quem está logado, sem input do formulário), o EXISTS é
-- falso e a função devolve true — sem restrição nenhuma no INSERT, que não
-- é o alvo. Se a linha já existe (UPDATE) e owner_id não mudou, também
-- devolve true. Só devolve false quando existe uma linha com este id cujo
-- owner_id gravado é DIFERENTE do proposto — exatamente a tentativa de
-- reatribuição. Admin continua livre (a política aceita OR com o papel).
-- ---------------------------------------------------------------------
create or replace function public.curso_mantem_owner(p_id uuid, p_owner_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from public.courses where id = p_id and owner_id <> p_owner_id
  );
$$;

revoke execute on function public.curso_mantem_owner(uuid, uuid) from public, anon;
grant execute on function public.curso_mantem_owner(uuid, uuid) to authenticated;

drop policy courses_escrita on public.courses;
create policy courses_escrita on public.courses
  for all to authenticated
  using (public.can_manage_course(id))
  with check (
    public.can_manage_area(area_id)
    and (public.auth_profile_role() = 'admin' or public.curso_mantem_owner(id, owner_id))
  );

-- ---------------------------------------------------------------------
-- 4. anexos_storage_escrita concedia uma capacidade que a aplicação nunca
-- usa: mintAttachmentUpload (src/server/attachments-upload.ts) sempre pede
-- a URL assinada pelo cliente ADMIN (service_role), e o token resultante
-- autoriza a escrita sozinho — não consulta RLS. A política, então, só
-- deixava aberto um canal de escrita DIRETA e sem escopo: qualquer líder
-- ativo gravava qualquer byte em qualquer caminho do bucket privado, sem
-- vínculo nenhum com uma aula que ele gerencia — uma capacidade que o
-- produto nunca exercita, e que também nunca precisou existir. Removida.
--
-- tests/db/rls.test.ts (seção "storage de anexos") passou a provar as duas
-- pontas: upload direto não funciona mais para ninguém (nem para quem
-- antes tinha permissão), e o caminho de verdade da aplicação — mint pelo
-- admin + uploadToSignedUrl — continua funcionando exatamente como antes.
-- ---------------------------------------------------------------------
drop policy anexos_storage_escrita on storage.objects;
