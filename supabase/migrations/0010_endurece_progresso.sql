-- Revisão de fase 3 (whole-branch review): sobrou uma instância da
-- assimetria que a 0009 existe para corrigir, desta vez em progresso, não
-- em fórum.

-- ---------------------------------------------------------------------
-- progresso_proprio (0008_revisao_de_fase.sql) exige can_access_course
-- (l.course_id) no WITH CHECK, mas nunca olha l.status — a mesma
-- assimetria que 0009 corrigiu na ESCRITA do fórum (perguntas_cria/
-- respostas_cria), que por sua vez espelhou o que 0005 já tinha corrigido
-- na LEITURA do fórum (perguntas_leitura, respostas_leitura, anexos_leitura).
-- can_access_course olha o CURSO (publicado? liberado?), nunca a AULA: um
-- membro com acesso ao curso conseguia INSERT em lesson_progress para uma
-- aula ainda em rascunho, falando direto com o PostgREST — a UI nem
-- oferece o botão "concluir" numa aula que ainda não mostra (getLessonView
-- já bloqueia isso), mas RLS é a camada que teria que sustentar de
-- verdade, e não sustentava.
--
-- A explorabilidade é baixa (precisaria do uuid de uma aula em rascunho,
-- que a política de LEITURA correspondente não entrega a quem não
-- gerencia), mas é a mesma forma exata do achado da 0009, só que em
-- progresso em vez de fórum.
--
-- Mesma correção: can_manage_course(l.course_id) no lugar de
-- can_access_course sozinho, para o gestor continuar podendo marcar a
-- própria aula em rascunho como concluída — é como ele testa a aula antes
-- de publicar. USING não muda: mesmo raciocínio de 0008/0009 — revogar
-- acesso depois de já haver progresso registrado não é o alvo aqui.
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
      where l.id = lesson_id
        and (
          public.can_manage_course(l.course_id)
          or (l.status = 'published' and public.can_access_course(l.course_id))
        )
    )
  );
