-- GEX Academy — schema inicial do MVP.
-- RLS é habilitado em todas as tabelas. As políticas de `areas` e `profiles`
-- vêm já aqui, porque sem elas o próprio login não funciona: getCurrentUser()
-- lê o perfil com o cliente do usuário. As políticas de conteúdo (cursos,
-- aulas, anexos, fórum) entram na fase 2, junto com can_access_course.

create extension if not exists "pgcrypto";

-- Áreas (setores da empresa)
create table public.areas (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  description text,
  color       text,
  position    int not null default 0,
  created_at  timestamptz not null default now()
);

-- Perfis (extensão de auth.users)
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text not null,
  email      text not null unique,
  avatar_url text,
  role       text not null default 'member' check (role in ('admin','leader','member')),
  area_id    uuid references public.areas(id) on delete set null,
  status     text not null default 'invited' check (status in ('invited','active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_area_id_idx on public.profiles(area_id);
create index profiles_role_idx on public.profiles(role);

-- Cursos
create table public.courses (
  id            uuid primary key default gen_random_uuid(),
  area_id       uuid references public.areas(id) on delete restrict,
  title         text not null,
  slug          text not null unique,
  description   text,
  cover_url     text,
  is_onboarding boolean not null default false,
  status        text not null default 'draft' check (status in ('draft','published')),
  owner_id      uuid not null references public.profiles(id) on delete restrict,
  position      int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Trilha inicial não pertence a área nenhuma; todo outro curso pertence a uma.
  constraint courses_onboarding_sem_area check (
    (is_onboarding and area_id is null) or (not is_onboarding and area_id is not null)
  )
);
create index courses_area_id_idx on public.courses(area_id);
create index courses_status_idx on public.courses(status);
-- No máximo uma trilha inicial na plataforma.
create unique index courses_uma_trilha_inicial on public.courses(is_onboarding) where is_onboarding;

-- Aulas
create table public.lessons (
  id               uuid primary key default gen_random_uuid(),
  course_id        uuid not null references public.courses(id) on delete cascade,
  title            text not null,
  slug             text not null,
  description      text,
  video_provider   text not null check (video_provider in ('youtube','vturb')),
  video_ref        text not null,
  duration_seconds int check (duration_seconds is null or duration_seconds > 0),
  status           text not null default 'draft' check (status in ('draft','published')),
  position         int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (course_id, slug)
);
create index lessons_course_id_idx on public.lessons(course_id);

-- Anexos da aula
create table public.lesson_attachments (
  id           uuid primary key default gen_random_uuid(),
  lesson_id    uuid not null references public.lessons(id) on delete cascade,
  file_name    text not null,
  storage_path text not null unique,
  mime_type    text not null,
  size_bytes   bigint not null check (size_bytes > 0),
  uploaded_by  uuid not null references public.profiles(id) on delete restrict,
  created_at   timestamptz not null default now()
);
create index lesson_attachments_lesson_id_idx on public.lesson_attachments(lesson_id);

-- Liberações individuais concedidas pelo admin
create table public.course_access (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  course_id  uuid not null references public.courses(id) on delete cascade,
  granted_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (user_id, course_id)
);
create index course_access_user_id_idx on public.course_access(user_id);

-- Solicitações de acesso (fila do cadeado)
create table public.access_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  course_id   uuid not null references public.courses(id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending','approved','denied')),
  message     text,
  decided_by  uuid references public.profiles(id) on delete set null,
  decided_at  timestamptz,
  created_at  timestamptz not null default now()
);
-- No máximo uma solicitação pendente por pessoa e curso.
create unique index access_requests_uma_pendente
  on public.access_requests(user_id, course_id) where status = 'pending';
create index access_requests_status_idx on public.access_requests(status);

-- Progresso
create table public.lesson_progress (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  lesson_id    uuid not null references public.lessons(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);
create index lesson_progress_lesson_id_idx on public.lesson_progress(lesson_id);

-- Fórum: perguntas
create table public.questions (
  id          uuid primary key default gen_random_uuid(),
  lesson_id   uuid not null references public.lessons(id) on delete cascade,
  author_id   uuid not null references public.profiles(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 4000),
  is_pinned   boolean not null default false,
  resolved_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index questions_lesson_id_idx on public.questions(lesson_id);
create index questions_author_created_idx on public.questions(author_id, created_at desc);

-- Fórum: respostas
create table public.answers (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  author_id   uuid not null references public.profiles(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 4000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index answers_question_id_idx on public.answers(question_id);
create index answers_author_created_idx on public.answers(author_id, created_at desc);

-- updated_at automático
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch  before update on public.profiles  for each row execute function public.touch_updated_at();
create trigger courses_touch   before update on public.courses   for each row execute function public.touch_updated_at();
create trigger lessons_touch   before update on public.lessons   for each row execute function public.touch_updated_at();
create trigger questions_touch before update on public.questions for each row execute function public.touch_updated_at();
create trigger answers_touch   before update on public.answers   for each row execute function public.touch_updated_at();

-- RLS ligado em tudo. Sem políticas ainda: só a service_role passa.
alter table public.areas              enable row level security;
alter table public.profiles           enable row level security;
alter table public.courses            enable row level security;
alter table public.lessons            enable row level security;
alter table public.lesson_attachments enable row level security;
alter table public.course_access      enable row level security;
alter table public.access_requests    enable row level security;
alter table public.lesson_progress    enable row level security;
alter table public.questions          enable row level security;
alter table public.answers            enable row level security;

-- Bucket privado dos anexos
insert into storage.buckets (id, name, public, file_size_limit)
values ('lesson-attachments', 'lesson-attachments', false, 52428800)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Helpers de autorização.
-- SECURITY DEFINER de propósito: leem `profiles` sem disparar as políticas
-- de `profiles`, o que causaria recursão infinita.
-- ---------------------------------------------------------------------

create or replace function public.auth_is_active()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active');
$$;

create or replace function public.auth_profile_role()
returns text language sql stable security definer set search_path = public as $$
  select p.role from public.profiles p where p.id = auth.uid();
$$;

create or replace function public.auth_profile_area()
returns uuid language sql stable security definer set search_path = public as $$
  select p.area_id from public.profiles p where p.id = auth.uid();
$$;

-- areas: todo colaborador ativo lê (a vitrine agrupa por área); só admin escreve.
create policy areas_leitura on public.areas
  for select to authenticated using (public.auth_is_active());
create policy areas_escrita on public.areas
  for all to authenticated
  using (public.auth_profile_role() = 'admin' and public.auth_is_active())
  with check (public.auth_profile_role() = 'admin' and public.auth_is_active());

-- profiles: cada um lê o próprio (sem isto, ninguém entra na plataforma);
-- admin lê e escreve todos; líder lê os da sua área, para o painel.
create policy profiles_leitura_propria on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_leitura_admin on public.profiles
  for select to authenticated
  using (public.auth_profile_role() = 'admin' and public.auth_is_active());
create policy profiles_leitura_lider on public.profiles
  for select to authenticated
  using (
    public.auth_profile_role() = 'leader'
    and public.auth_is_active()
    and area_id is not null
    and area_id = public.auth_profile_area()
  );
create policy profiles_admin_escreve on public.profiles
  for update to authenticated
  using (public.auth_profile_role() = 'admin' and public.auth_is_active())
  with check (public.auth_profile_role() = 'admin' and public.auth_is_active());
-- A pessoa só pode ativar a própria conta, vinda do convite.
-- O WITH CHECK fixa papel, área e e-mail nos valores atuais: sem isso, qualquer
-- usuário `invited` viraria admin na mesma UPDATE que ativa a conta.
create policy profiles_ativa_a_si on public.profiles
  for update to authenticated
  using (id = auth.uid() and status = 'invited')
  with check (
    id = auth.uid()
    and status = 'active'
    and role = public.auth_profile_role()
    and area_id is not distinct from public.auth_profile_area()
    and email = (select p.email from public.profiles p where p.id = auth.uid())
  );

-- ---------------------------------------------------------------------
-- Invariante: a plataforma sempre precisa de ao menos um admin ativo.
-- Sem isto, dois admins podem se rebaixar/desativar um ao outro em paralelo:
-- cada UPDATE olha só a própria linha-alvo (que não é a de quem está logado),
-- então nem a guarda de "não pode se autossabotar" em código nem a política
-- profiles_admin_escreve percebem que, juntas, as duas escritas zeram a
-- contagem de admins. SECURITY DEFINER pelo mesmo motivo dos helpers acima:
-- precisa enxergar todos os perfis, não só os que o RLS liberaria para quem
-- está fazendo o UPDATE/DELETE.
-- ---------------------------------------------------------------------

create or replace function public.exige_ao_menos_um_admin()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  deixou_de_ser_admin boolean;
begin
  deixou_de_ser_admin :=
    (old.role = 'admin' and old.status = 'active')
    and (tg_op = 'DELETE' or new.role <> 'admin' or new.status <> 'active');

  -- O FOR UPDATE é o ponto central da correção: sob READ COMMITTED, sem ele,
  -- duas transações concorrentes (uma rebaixando A, outra rebaixando B) cada
  -- uma enxergaria a outra ainda como admin ativo e as duas passariam. Com o
  -- FOR UPDATE, a transação de A bloqueia na linha de B até B committar; ao
  -- reavaliar, B já não bate mais com role='admin' and status='active', o
  -- EXISTS falha e a transação de A é abortada.
  if deixou_de_ser_admin and not exists (
    select 1 from public.profiles p
    where p.role = 'admin' and p.status = 'active' and p.id <> old.id
    for update
  ) then
    raise exception 'A plataforma precisa de ao menos um administrador ativo.';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger profiles_exige_admin
  before update or delete on public.profiles
  for each row execute function public.exige_ao_menos_um_admin();
