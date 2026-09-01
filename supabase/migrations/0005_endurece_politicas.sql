-- Endurece políticas apontadas em revisão: auth_is_active() faltando em seis
-- lugares, uma RPC sem gate de chamador, três leituras sem filtro de status
-- de aula, e duas edições de fórum que aceitavam qualquer coluna nova.

-- ---------------------------------------------------------------------
-- 1. courses_escrita: FOR ALL aplica só WITH CHECK a INSERT — e esse
-- WITH CHECK nunca chamava auth_is_active() nem can_manage_course(), sendo
-- uma TERCEIRA cópia manual da regra de "quem gerencia". Como desativação
-- não bloqueia o Supabase Auth (ver comentário de 0004), um líder ou admin
-- desativado ainda conseguia fazer login e POST em /rest/v1/courses; a
-- linha era criada, mesmo que ele não conseguisse mais lê-la depois.
-- Divergência direta da regra 1 do TypeScript: "Só quem está ativo acessa
-- qualquer coisa — inclusive admin".
-- ---------------------------------------------------------------------
drop policy courses_escrita on public.courses;
create policy courses_escrita on public.courses
  for all to authenticated
  using (public.can_manage_course(id))
  with check (
    public.auth_is_active()
    and (
      public.auth_profile_role() = 'admin'
      or (
        public.auth_profile_role() = 'leader'
        and public.auth_profile_area() is not null
        and public.auth_profile_area() = area_id
      )
    )
  );

-- ---------------------------------------------------------------------
-- 2. contar_aulas_publicadas(): o filtro de linha estava certo, mas quem
-- podia CHAMAR a função não. Postgres concede EXECUTE a PUBLIC por padrão
-- em função nova, e o Supabase concede a anon também — não havia nenhum
-- "revoke" no projeto. Isso significa que POST /rest/v1/rpc/contar_aulas_publicadas
-- com só a chave publicável (que vai em todo bundle de navegador) devolvia
-- o id e a contagem de aula de todo curso publicado, sem sessão nenhuma —
-- uma superfície anônima nova que esta própria migration cria duas
-- instruções depois de corrigir o mesmo tipo de furo em lessons_leitura.
--
-- Duas camadas: o filtro de linha (auth_is_active() no WHERE, devolve
-- conjunto vazio para quem não está ativo) E o revoke/grant de EXECUTE
-- (barra a chamada antes mesmo de rodar a query, inclusive para anon).
-- ---------------------------------------------------------------------
create or replace function public.contar_aulas_publicadas()
returns table (course_id uuid, total bigint)
language sql stable security definer set search_path = public as $$
  select l.course_id, count(*)
  from public.lessons l
  join public.courses c on c.id = l.course_id
  where public.auth_is_active()
    and l.status = 'published'
    and c.status = 'published'
  group by l.course_id;
$$;

revoke execute on function public.contar_aulas_publicadas() from public, anon;
grant execute on function public.contar_aulas_publicadas() to authenticated;

-- ---------------------------------------------------------------------
-- 6. anexos_leitura, perguntas_leitura e respostas_leitura checavam só
-- can_access_course(course_id) — acesso de CURSO, não de AULA — e por isso
-- nunca reproduziam o filtro de status que lessons_leitura já tem. Um curso
-- publicado pode ter aulas ainda em rascunho (o líder publica aula por
-- aula); um colaborador da área lia file_name/storage_path de anexo de aula
-- que o líder ainda não publicou. Os bytes do arquivo continuam protegidos
-- (o download passa por link assinado), mas o nome do arquivo já vazava.
-- Mesma estrutura que lessons_leitura usa desde 0004: quem gerencia vê
-- rascunho; quem só acessa o curso, só vê o que está publicado.
-- ---------------------------------------------------------------------
drop policy anexos_leitura on public.lesson_attachments;
create policy anexos_leitura on public.lesson_attachments
  for select to authenticated
  using (
    exists (
      select 1 from public.lessons l
      where l.id = lesson_id
        and (
          public.can_manage_course(l.course_id)
          or (l.status = 'published' and public.can_access_course(l.course_id))
        )
    )
  );

drop policy perguntas_leitura on public.questions;
create policy perguntas_leitura on public.questions
  for select to authenticated
  using (
    exists (
      select 1 from public.lessons l
      where l.id = lesson_id
        and (
          public.can_manage_course(l.course_id)
          or (l.status = 'published' and public.can_access_course(l.course_id))
        )
    )
  );

drop policy respostas_leitura on public.answers;
create policy respostas_leitura on public.answers
  for select to authenticated
  using (
    exists (
      select 1 from public.questions q join public.lessons l on l.id = q.lesson_id
      where q.id = question_id
        and (
          public.can_manage_course(l.course_id)
          or (l.status = 'published' and public.can_access_course(l.course_id))
        )
    )
  );

-- ---------------------------------------------------------------------
-- 5 + 7. perguntas_edita/respostas_edita: USING seleciona a linha (autor OU
-- quem gerencia), mas o WITH CHECK antigo era `with check (true)` (perguntas)
-- ou só travava author_id (respostas) — sem travar a OUTRA chave estrangeira.
-- `questions` e `answers` têm uma única política de UPDATE cada, então nada
-- soma com "and" contra esse WITH CHECK frouxo.
--
-- Duas consequências exploráveis: (a) um membro posta numa aula que acessa
-- de verdade, depois faz PATCH em lesson_id/question_id para mover a
-- pergunta/resposta para dentro de um curso ao qual não tem acesso nenhum —
-- injetando conteúdo num fórum cuja política de INSERT o bloqueia
-- explicitamente; (b) faz PATCH em author_id e atribui o próprio texto a
-- outra pessoa. A correção trava author_id e a chave de "onde a linha mora"
-- (lesson_id / question_id) ao valor já gravado, via subconsulta
-- autocorrelacionada — mesma técnica que profiles_ativa_a_si (0001) já usa
-- para travar e-mail, só que aqui contra a própria linha (id), não contra
-- auth.uid(). O alias "antiga" evita a linha nova (em avaliação) capturar a
-- referência por engano — dentro da subconsulta, colunas não qualificadas
-- resolveriam para o alias mais interno (antiga), por isso o lado de fora
-- usa o nome da tabela (questions./answers., não aliasado) para apontar
-- de volta pra linha sendo checada.
--
-- Ambas ganham também auth_is_active() no ramo "sou o autor": pessoa
-- desativada não editava mais curso/aula/anexo desde 0003, mas ainda podia
-- editar a própria pergunta/resposta, porque author_id = auth.uid() não
-- checava status. is_pinned/resolved_at continuam editáveis por quem já
-- passa no USING (autor ou gestor) — não é o alvo desta correção, que é
-- lesson_id/question_id/author_id; fica registrado para uma futura tarefa
-- se o produto quiser reservar esses dois campos só para quem gerencia.
-- ---------------------------------------------------------------------
drop policy perguntas_edita on public.questions;
create policy perguntas_edita on public.questions
  for update to authenticated
  using (
    (author_id = auth.uid() and public.auth_is_active())
    or exists (select 1 from public.lessons l where l.id = lesson_id and public.can_manage_course(l.course_id))
  )
  with check (
    exists (
      select 1 from public.questions antiga
      where antiga.id = questions.id
        and antiga.author_id = questions.author_id
        and antiga.lesson_id = questions.lesson_id
    )
  );

drop policy perguntas_apaga on public.questions;
create policy perguntas_apaga on public.questions
  for delete to authenticated
  using (
    (author_id = auth.uid() and public.auth_is_active())
    or exists (select 1 from public.lessons l where l.id = lesson_id and public.can_manage_course(l.course_id))
  );

drop policy respostas_edita on public.answers;
create policy respostas_edita on public.answers
  for update to authenticated
  using (author_id = auth.uid() and public.auth_is_active())
  with check (
    exists (
      select 1 from public.answers antiga
      where antiga.id = answers.id
        and antiga.author_id = answers.author_id
        and antiga.question_id = answers.question_id
    )
  );

drop policy respostas_apaga on public.answers;
create policy respostas_apaga on public.answers
  for delete to authenticated
  using (
    (author_id = auth.uid() and public.auth_is_active())
    or exists (
      select 1 from public.questions q join public.lessons l on l.id = q.lesson_id
      where q.id = question_id and public.can_manage_course(l.course_id)
    )
  );

-- ---------------------------------------------------------------------
-- 9. anexos_storage_escrita checava só o papel (admin/leader), nunca
-- auth_is_active() — mesmo padrão dos itens acima: líder desativado (ou de
-- área nenhuma relacionada ao anexo) ainda conseguia subir objeto pro bucket.
-- Objeto órfão (sem linha em lesson_attachments) é inalcançável por link
-- assinado, então o impacto é ruído de storage, não vazamento de conteúdo —
-- mas o padrão que falta é o mesmo dos outros seis lugares desta migration.
-- ---------------------------------------------------------------------
drop policy anexos_storage_escrita on storage.objects;
create policy anexos_storage_escrita on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'lesson-attachments'
    and public.auth_profile_role() in ('admin','leader')
    and public.auth_is_active()
  );
