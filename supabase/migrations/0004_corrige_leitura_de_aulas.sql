-- Corrige lessons_leitura (0003): RLS é por LINHA, não por coluna. A
-- cláusula que existia só para a vitrine CONTAR aulas publicadas de curso
-- bloqueado também liberava a linha inteira — video_ref incluído. Para um
-- vídeo do YouTube não listado, o ref É o acesso (spec §8): um colega de
-- outra área podia ler o id da aula e assistir ao vídeo de um curso ao qual
-- nunca foi liberado, mesmo com anexo e fórum corretamente bloqueados.
--
-- A vitrine ainda precisa mostrar "N aulas" em curso bloqueado (spec §6).
-- Esta função devolve só a contagem por curso, nunca a linha da aula.
create or replace function public.contar_aulas_publicadas()
returns table (course_id uuid, total bigint)
language sql stable security definer set search_path = public as $$
  select l.course_id, count(*)
  from public.lessons l
  join public.courses c on c.id = l.course_id
  where l.status = 'published' and c.status = 'published'
  group by l.course_id;
$$;

drop policy lessons_leitura on public.lessons;
create policy lessons_leitura on public.lessons
  for select to authenticated
  using (
    public.auth_is_active()
    and (
      public.can_manage_course(course_id)
      or (status = 'published' and public.can_access_course(course_id))
    )
  );

-- course_access e access_requests: o ramo "vejo a própria linha" não exigia
-- auth_is_active(), ao contrário de lesson_progress (progresso_proprio).
-- Login no Supabase Auth não é bloqueado por status — quem corta é o RLS —
-- então uma pessoa desativada ainda lia as próprias liberações e
-- solicitações passadas. Não vaza conteúdo (curso/aula/anexo já cortam
-- corretamente por auth_is_active()), mas a inconsistência não se justifica:
-- alinhando aqui com o resto das políticas que leem "a própria linha".
drop policy liberacoes_leitura on public.course_access;
create policy liberacoes_leitura on public.course_access
  for select to authenticated
  using (
    (user_id = auth.uid() and public.auth_is_active())
    or (public.auth_profile_role() = 'admin' and public.auth_is_active())
  );

drop policy solicitacoes_leitura on public.access_requests;
create policy solicitacoes_leitura on public.access_requests
  for select to authenticated
  using (
    (user_id = auth.uid() and public.auth_is_active())
    or (public.auth_profile_role() = 'admin' and public.auth_is_active())
  );
