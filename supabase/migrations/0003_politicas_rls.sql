-- Políticas RLS espelhando src/lib/access/can-access-course.ts.
-- Ao alterar a regra em TypeScript, altere aqui na mesma tarefa.

-- Os helpers auth_is_active(), auth_profile_role() e auth_profile_area(), e as
-- políticas de `areas` e `profiles`, já vieram em 0001_schema_inicial.sql.
-- Aqui entram as funções de acesso a conteúdo e as políticas que dependem delas.

-- Gerenciar: admin em qualquer curso; líder no curso da sua própria área.
create or replace function public.can_manage_course(p_course_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.auth_is_active() and exists (
    select 1 from public.courses c
    where c.id = p_course_id
      and (
        public.auth_profile_role() = 'admin'
        or (
          public.auth_profile_role() = 'leader'
          and public.auth_profile_area() is not null
          and public.auth_profile_area() = c.area_id
        )
      )
  );
$$;

-- Ver o conteúdo: mesma ordem da função TypeScript.
create or replace function public.can_access_course(p_course_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.auth_is_active() and exists (
    select 1 from public.courses c
    where c.id = p_course_id
      and (
        public.can_manage_course(c.id)
        or (
          c.status = 'published'
          and (
            c.is_onboarding
            or (public.auth_profile_area() is not null and public.auth_profile_area() = c.area_id)
            or exists (
              select 1 from public.course_access ca
              where ca.course_id = c.id and ca.user_id = auth.uid()
            )
          )
        )
      )
  );
$$;

-- courses: a vitrine mostra todo curso publicado; rascunho só para quem gerencia.
create policy courses_leitura on public.courses
  for select to authenticated
  using (public.auth_is_active() and (status = 'published' or public.can_manage_course(id)));
create policy courses_escrita on public.courses
  for all to authenticated
  using (public.can_manage_course(id))
  with check (
    public.auth_profile_role() = 'admin'
    or (
      public.auth_profile_role() = 'leader'
      and public.auth_profile_area() is not null
      and public.auth_profile_area() = area_id
    )
  );

-- lessons: título e duração acompanham a leitura do curso; o restante exige acesso.
-- A vitrine só precisa CONTAR aulas publicadas, e isso a política permite.
create policy lessons_leitura on public.lessons
  for select to authenticated
  using (
    public.auth_is_active()
    and (
      public.can_manage_course(course_id)
      or (status = 'published' and public.can_access_course(course_id))
      or (
        status = 'published'
        and exists (select 1 from public.courses c where c.id = course_id and c.status = 'published')
      )
    )
  );
create policy lessons_escrita on public.lessons
  for all to authenticated
  using (public.can_manage_course(course_id))
  with check (public.can_manage_course(course_id));

-- lesson_attachments: material é conteúdo. Exige acesso ao curso, sem exceção.
create policy anexos_leitura on public.lesson_attachments
  for select to authenticated
  using (
    exists (
      select 1 from public.lessons l
      where l.id = lesson_id and public.can_access_course(l.course_id)
    )
  );
create policy anexos_escrita on public.lesson_attachments
  for all to authenticated
  using (
    exists (select 1 from public.lessons l where l.id = lesson_id and public.can_manage_course(l.course_id))
  )
  with check (
    exists (select 1 from public.lessons l where l.id = lesson_id and public.can_manage_course(l.course_id))
  );

-- course_access: cada um vê as próprias liberações; só admin concede.
create policy liberacoes_leitura on public.course_access
  for select to authenticated
  using (user_id = auth.uid() or (public.auth_profile_role() = 'admin' and public.auth_is_active()));
create policy liberacoes_escrita on public.course_access
  for all to authenticated
  using (public.auth_profile_role() = 'admin' and public.auth_is_active())
  with check (public.auth_profile_role() = 'admin' and public.auth_is_active());

-- access_requests: a pessoa cria e vê as próprias; admin vê e decide todas.
create policy solicitacoes_leitura on public.access_requests
  for select to authenticated
  using (user_id = auth.uid() or (public.auth_profile_role() = 'admin' and public.auth_is_active()));
create policy solicitacoes_cria on public.access_requests
  for insert to authenticated
  with check (user_id = auth.uid() and public.auth_is_active() and status = 'pending');
create policy solicitacoes_decide on public.access_requests
  for update to authenticated
  using (public.auth_profile_role() = 'admin' and public.auth_is_active())
  with check (public.auth_profile_role() = 'admin' and public.auth_is_active());

-- lesson_progress: cada um escreve o próprio; líder e admin leem para o painel.
create policy progresso_proprio on public.lesson_progress
  for all to authenticated
  using (user_id = auth.uid() and public.auth_is_active())
  with check (user_id = auth.uid() and public.auth_is_active());
create policy progresso_gestao on public.lesson_progress
  for select to authenticated
  using (
    exists (
      select 1 from public.lessons l
      where l.id = lesson_id and public.can_manage_course(l.course_id)
    )
  );

-- questions e answers: o fórum é visível para quem tem acesso à aula.
create policy perguntas_leitura on public.questions
  for select to authenticated
  using (exists (select 1 from public.lessons l where l.id = lesson_id and public.can_access_course(l.course_id)));
create policy perguntas_cria on public.questions
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (select 1 from public.lessons l where l.id = lesson_id and public.can_access_course(l.course_id))
  );
create policy perguntas_edita on public.questions
  for update to authenticated
  using (
    author_id = auth.uid()
    or exists (select 1 from public.lessons l where l.id = lesson_id and public.can_manage_course(l.course_id))
  )
  with check (true);
create policy perguntas_apaga on public.questions
  for delete to authenticated
  using (
    author_id = auth.uid()
    or exists (select 1 from public.lessons l where l.id = lesson_id and public.can_manage_course(l.course_id))
  );

create policy respostas_leitura on public.answers
  for select to authenticated
  using (
    exists (
      select 1 from public.questions q join public.lessons l on l.id = q.lesson_id
      where q.id = question_id and public.can_access_course(l.course_id)
    )
  );
create policy respostas_cria on public.answers
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.questions q join public.lessons l on l.id = q.lesson_id
      where q.id = question_id and public.can_access_course(l.course_id)
    )
  );
create policy respostas_edita on public.answers
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy respostas_apaga on public.answers
  for delete to authenticated
  using (
    author_id = auth.uid()
    or exists (
      select 1 from public.questions q join public.lessons l on l.id = q.lesson_id
      where q.id = question_id and public.can_manage_course(l.course_id)
    )
  );

-- storage: o bucket é privado e o download passa por link assinado gerado no
-- servidor. Nenhuma política de leitura direta é criada de propósito.
create policy anexos_storage_escrita on storage.objects
  for insert to authenticated
  with check (bucket_id = 'lesson-attachments' and public.auth_profile_role() in ('admin','leader'));
