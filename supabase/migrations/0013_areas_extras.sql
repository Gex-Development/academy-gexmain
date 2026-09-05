-- Áreas extras: dar a um colaborador acesso de LEITURA a mais de uma área.
--
-- Por que uma tabela, e não mais colunas em profiles: o perfil continua com
-- UMA área principal (profiles.area_id). É ela que define de qual área alguém
-- é líder (regra 3 de canAccessCourse) e quais pessoas o painel do líder
-- acompanha. Área extra é acréscimo de leitura, nunca de gestão — por isso
-- mora fora do perfil, do mesmo jeito que course_access.
--
-- Por que não bastava course_access: liberação por curso não cobre curso
-- FUTURO. Quem recebeu os três cursos de Tráfego hoje não vê o quarto que o
-- líder publicar amanhã. Área extra cobre.

create table public.area_access (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  area_id    uuid not null references public.areas(id) on delete cascade,
  granted_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (user_id, area_id)
);
create index area_access_user_id_idx on public.area_access(user_id);

alter table public.area_access enable row level security;

-- Espelha as políticas de course_access JÁ CORRIGIDAS pela migration 0004: o
-- ramo "vejo a minha própria linha" exige auth_is_active(). Sem isso, quem foi
-- desativado continuava lendo as próprias liberações — o defeito que a 0004
-- consertou na tabela irmã. Aqui já nasce certo.
create policy areas_extras_leitura on public.area_access
  for select to authenticated
  using (
    (user_id = auth.uid() and public.auth_is_active())
    or (public.auth_profile_role() = 'admin' and public.auth_is_active())
  );
create policy areas_extras_escrita on public.area_access
  for all to authenticated
  using (public.auth_profile_role() = 'admin' and public.auth_is_active())
  with check (public.auth_profile_role() = 'admin' and public.auth_is_active());

-- O espelho da regra. Precisa ficar na MESMA ORDEM da função TypeScript
-- (src/lib/access/can-access-course.ts) — tests/db/paridade-acesso.test.ts
-- compara as duas caso a caso contra este banco.
--
-- O ramo novo entra junto com os outros dois de leitura, DEPOIS da checagem de
-- publicado: área extra nunca revela rascunho.
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
            or (
              c.area_id is not null
              and exists (
                select 1 from public.area_access aa
                where aa.area_id = c.area_id and aa.user_id = auth.uid()
              )
            )
            or exists (
              select 1 from public.course_access ca
              where ca.course_id = c.id and ca.user_id = auth.uid()
            )
          )
        )
      )
  );
$$;
