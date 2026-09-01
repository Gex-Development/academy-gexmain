-- Cinco achados da re-revisão, todos sobre a mesma classe de risco:
-- função security definer sem gate de chamador, ou predicado que reconsulta
-- uma tabela por id em vez de olhar as colunas da própria linha.

-- ---------------------------------------------------------------------
-- 1 + 4. pergunta_mantem_chaves/resposta_mantem_chaves (0006) tinham o
-- mesmo furo que contar_aulas_publicadas (0005) tinha antes de ser
-- corrigida: security definer, três argumentos controlados por quem chama,
-- sem revoke — EXECUTE aberto para PUBLIC/anon por padrão. Diferente de
-- can_access_course/can_manage_course/auth_profile_*, que se auto-limitam
-- por auth.uid()/auth_is_active() e devolvem false/null pra quem não está
-- logado ou está inativo, estas duas não checavam status nenhum: um POST
-- anônimo em /rest/v1/rpc/pergunta_mantem_chaves respondia uma pergunta
-- sobre `questions` com RLS completamente ignorado.
--
-- Aproveitando a reescrita: achado 4 pedia travar também is_pinned e
-- resolved_at no ramo "sou o autor" — is_pinned tinha ficado de fora da
-- correção anterior porque parecia exigir duas políticas de UPDATE (a
-- armadilha que 0002 documenta, políticas permissivas se combinam por OR).
-- Não se aplica aqui: `questions` tem uma única política de UPDATE, então
-- dá para expressar a condição toda dentro do mesmo WITH CHECK, sem
-- precisar de uma segunda política. pergunta_mantem_chaves ganha dois
-- parâmetros novos (is_pinned, resolved_at) e permite mudá-los só quando
-- quem está editando gerencia o curso da aula — author_id/lesson_id
-- continuam travados para todo mundo, gestor incluso: mover uma pergunta de
-- aula não é uma ação de moderação legítima para ninguém.
-- ---------------------------------------------------------------------
drop policy perguntas_edita on public.questions;
drop function public.pergunta_mantem_chaves(uuid, uuid, uuid);

create or replace function public.pergunta_mantem_chaves(
  p_id uuid, p_lesson_id uuid, p_author_id uuid, p_is_pinned boolean, p_resolved_at timestamptz
)
returns boolean language sql stable security definer set search_path = public as $$
  select public.auth_is_active() and exists (
    select 1 from public.questions q
    where q.id = p_id
      and q.lesson_id = p_lesson_id
      and q.author_id = p_author_id
      and (
        (q.is_pinned = p_is_pinned and q.resolved_at is not distinct from p_resolved_at)
        or public.can_manage_course((select l.course_id from public.lessons l where l.id = q.lesson_id))
      )
  );
$$;

create or replace function public.resposta_mantem_chaves(p_id uuid, p_question_id uuid, p_author_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.auth_is_active() and exists (
    select 1 from public.answers
    where id = p_id and question_id = p_question_id and author_id = p_author_id
  );
$$;

revoke execute on function public.pergunta_mantem_chaves(uuid, uuid, uuid, boolean, timestamptz) from public, anon;
grant execute on function public.pergunta_mantem_chaves(uuid, uuid, uuid, boolean, timestamptz) to authenticated;

revoke execute on function public.resposta_mantem_chaves(uuid, uuid, uuid) from public, anon;
grant execute on function public.resposta_mantem_chaves(uuid, uuid, uuid) to authenticated;

create policy perguntas_edita on public.questions
  for update to authenticated
  using (
    (author_id = auth.uid() and public.auth_is_active())
    or exists (select 1 from public.lessons l where l.id = lesson_id and public.can_manage_course(l.course_id))
  )
  with check (public.pergunta_mantem_chaves(id, lesson_id, author_id, is_pinned, resolved_at));

drop policy respostas_edita on public.answers;
create policy respostas_edita on public.answers
  for update to authenticated
  using (author_id = auth.uid() and public.auth_is_active())
  with check (public.resposta_mantem_chaves(id, question_id, author_id));

-- ---------------------------------------------------------------------
-- 5. courses_leitura chamava can_manage_course(id), que é stable e
-- reconsulta `courses` pelo próprio id — dentro de INSERT ... RETURNING,
-- essa reconsulta não enxerga a linha ainda sendo inserida no MESMO
-- comando (efeito de MVCC dentro de um único comando, não uma falha de
-- autorização), e o Postgres recusa devolver a linha com 42501. Como
-- courses.status é 'draft' por padrão, TODO insert de curso teria esse
-- problema assim que alguém encadeasse .select() — exatamente o que a
-- tarefa 2 desta fase faz ao criar um curso.
--
-- can_manage_area(p_area_id) resolve isso não reconsultando `courses`: ela
-- só olha o papel/área de quem está chamando (via auth_profile_role/
-- auth_profile_area, que consultam profiles, não courses) contra o
-- area_id que a própria política já tem em mãos — a coluna da linha sendo
-- avaliada, sem subconsulta nenhuma. Substitui can_manage_course(id) no
-- ramo de gerência de courses_leitura e a cópia manual da regra que
-- courses_escrita usava no WITH CHECK (o achado 1 já tinha corrigido essa
-- cópia adicionando auth_is_active(); agora ela some, substituída pela
-- função compartilhada). courses_escrita.USING continua com
-- can_manage_course(id) — ali a linha já existe de antes (UPDATE/DELETE),
-- sem o problema de MVCC de uma linha nova no mesmo comando.
-- ---------------------------------------------------------------------
create or replace function public.can_manage_area(p_area_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.auth_is_active() and (
    public.auth_profile_role() = 'admin'
    or (
      public.auth_profile_role() = 'leader'
      and public.auth_profile_area() is not null
      and public.auth_profile_area() = p_area_id
    )
  );
$$;

drop policy courses_leitura on public.courses;
create policy courses_leitura on public.courses
  for select to authenticated
  using (public.auth_is_active() and (status = 'published' or public.can_manage_area(area_id)));

drop policy courses_escrita on public.courses;
create policy courses_escrita on public.courses
  for all to authenticated
  using (public.can_manage_course(id))
  with check (public.can_manage_area(area_id));
