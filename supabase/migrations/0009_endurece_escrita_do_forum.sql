-- perguntas_cria e respostas_cria (0003) exigem can_access_course(l.course_id)
-- mas nunca olham l.status — a mesma assimetria que 0005 corrigiu nas
-- políticas de LEITURA do fórum (perguntas_leitura, respostas_leitura,
-- anexos_leitura), que ganharam
--   can_manage_course(l.course_id)
--   or (l.status = 'published' and can_access_course(l.course_id))
-- em vez do can_access_course sozinho. A leitura foi corrigida; a escrita
-- ficou para trás. can_access_course olha o CURSO (publicado? liberado?),
-- nunca a AULA — um membro com acesso ao curso publica pergunta/resposta
-- numa aula que o líder ainda não publicou, falando direto com o PostgREST
-- (a UI nem oferece o formulário numa aula em rascunho, mas RLS é a camada
-- que teria que segurar isso, e não segurava). O conteúdo aparece pro
-- gestor tanto na aula (perguntas_leitura já libera quem gerencia a ver
-- rascunho) quanto na fila de dúvidas do líder — publicado por alguém que
-- não deveria nem saber que aquela aula existe ainda.
--
-- Mesma forma do fix de 0005: can_manage_course no lugar de
-- can_access_course sozinho, para o gestor continuar podendo postar numa
-- aula em rascunho — é como ele testa a própria aula antes de publicar.
-- author_id = auth.uid() (a condição que já existia) continua exigido para
-- os dois.
drop policy perguntas_cria on public.questions;
create policy perguntas_cria on public.questions
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.lessons l
      where l.id = lesson_id
        and (
          public.can_manage_course(l.course_id)
          or (l.status = 'published' and public.can_access_course(l.course_id))
        )
    )
  );

drop policy respostas_cria on public.answers;
create policy respostas_cria on public.answers
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.questions q join public.lessons l on l.id = q.lesson_id
      where q.id = question_id
        and (
          public.can_manage_course(l.course_id)
          or (l.status = 'published' and public.can_access_course(l.course_id))
        )
    )
  );
