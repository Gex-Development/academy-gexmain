# GEX Academy — Fase 1: Fundação e Acesso — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a plataforma com pessoas dentro dela: o admin cria áreas, convida colaboradores com papel e setor, e cada um entra com sua senha vendo a navegação correspondente ao seu papel.

**Architecture:** Next.js 16 (App Router) com TypeScript, servindo tudo do servidor. O Supabase fornece Postgres, Auth e Storage. A regra de autorização vive numa função pura em `src/lib/access/`, isolada e coberta por testes, e é consumida exclusivamente pela camada `src/server/`. Nenhum componente de tela conversa com o Supabase diretamente.

**Tech Stack:** Next.js 16, TypeScript, Tailwind CSS v4, Supabase (Postgres/Auth/Storage), Zod, Vitest, Playwright, Vercel.

**Spec:** `docs/superpowers/specs/2026-08-31-gex-academy-design.md`

## Global Constraints

Estas regras valem para **todas** as tarefas deste plano e dos planos das fases 2 e 3.

- Next.js **16** (App Router). O arquivo de middleware chama-se `src/proxy.ts` e exporta uma função chamada `proxy` — `middleware.ts` está descontinuado no Next 16. O runtime do `proxy` é `nodejs` e não é configurável.
- Autenticação **obrigatoriamente** com `@supabase/ssr`. Cookies apenas com `getAll` e `setAll`. **Nunca** usar `get`, `set` ou `remove`. **Nunca** importar `@supabase/auth-helpers-nextjs`.
- Variáveis de ambiente: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `NEXT_PUBLIC_SITE_URL`. `SUPABASE_SERVICE_ROLE_KEY` e `RESEND_API_KEY` **nunca** recebem o prefixo `NEXT_PUBLIC_`.
- Nenhum componente em `src/components/` ou `src/app/` chama o Supabase diretamente. Toda leitura e escrita passa por `src/server/`.
- Toda server action valida a entrada com Zod antes de agir e verifica o papel do usuário. Nunca confia no que a tela enviou.
- Server actions devolvem `ActionResult<T>`, nunca lançam exceção para a tela.
- Nenhum HTML fornecido por usuário é renderizado.
- RLS habilitado em **todas** as tabelas.
- Interface em português do Brasil. Fuso `America/Sao_Paulo`.
- TypeScript em modo `strict`. Sem `any`.
- Um commit por tarefa concluída, no mínimo.

---

### Task 1: Scaffold do projeto e infraestrutura de testes

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `src/app/layout.tsx`, `src/app/globals.css` (via `create-next-app`)
- Create: `vitest.config.ts`
- Create: `vitest.db.config.ts`
- Create: `playwright.config.ts`
- Create: `.env.local.example`
- Create: `.gitignore` (ajustar o gerado)
- Create: `src/lib/format.ts`
- Test: `src/lib/format.test.ts`

**Interfaces:**
- Consumes: nada (primeira tarefa).
- Produces: `formatDuration(seconds: number | null): string` em `src/lib/format.ts`. Scripts npm `test`, `test:db`, `test:e2e` e os de banco (a Task 2 os reaponta para o projeto Supabase remoto).

- [ ] **Step 1: Criar o app Next.js na raiz do repositório**

O repositório já contém `docs/`, e o `create-next-app` recusa diretórios não vazios. Por isso, gere num diretório temporário e mova o conteúdo:

```bash
npx create-next-app@latest gex-tmp --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes
rm -rf gex-tmp/.git
shopt -s dotglob
mv gex-tmp/* .
shopt -u dotglob
rmdir gex-tmp
```

- [ ] **Step 2: Instalar as dependências do projeto**

```bash
npm install @supabase/ssr @supabase/supabase-js zod
npm install -D vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @vitejs/plugin-react @playwright/test dotenv
npx playwright install chromium
```

- [ ] **Step 3: Configurar o Vitest para testes unitários**

Crie `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['node_modules/**', 'e2e/**', 'tests/**'],
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
})
```

Crie `vitest.setup.ts`:

```typescript
import '@testing-library/jest-dom/vitest'
```

Testes de componente declaram o ambiente no topo do arquivo com `// @vitest-environment jsdom`. O ambiente padrão é `node` para que os testes de integração com banco usem o `fetch` nativo sem interferência do jsdom.

- [ ] **Step 4: Configurar o Vitest para testes de banco e o Playwright**

Crie `vitest.db.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/db/**/*.test.ts'],
    setupFiles: ['./tests/db/setup.ts'],
    fileParallelism: false,
    testTimeout: 20000,
  },
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
})
```

Crie `playwright.config.ts`:

```typescript
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120000,
  },
})
```

- [ ] **Step 5: Registrar os scripts npm**

Em `package.json`, substitua o bloco `scripts` por:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:db": "vitest run --config vitest.db.config.ts",
    "test:e2e": "playwright test",
    "db:start": "supabase start",
    "db:stop": "supabase stop",
    "db:reset": "supabase db reset",
    "db:types": "supabase gen types typescript --local > src/lib/supabase/database.types.ts"
  }
}
```

- [ ] **Step 6: Criar `.env.local.example` e proteger segredos no `.gitignore`**

Crie `.env.local.example`:

```bash
# URL e chave pública do projeto Supabase (podem ir para o navegador)
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=

# Segredos — NUNCA prefixar com NEXT_PUBLIC_
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=

EMAIL_FROM="GEX Academy <academy@gexcorp.com.br>"
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Acrescente ao final de `.gitignore`:

```
# ambiente
.env.local
.env*.local

# supabase
supabase/.branches
supabase/.temp

# testes
/test-results
/playwright-report
/coverage
```

- [ ] **Step 7: Escrever o teste que falha para `formatDuration`**

Crie `src/lib/format.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { formatDuration } from './format'

describe('formatDuration', () => {
  it('devolve traço quando a duração não foi informada', () => {
    expect(formatDuration(null)).toBe('—')
  })

  it('formata menos de um minuto como minutos arredondados para 1', () => {
    expect(formatDuration(45)).toBe('1 min')
  })

  it('formata minutos exatos', () => {
    expect(formatDuration(600)).toBe('10 min')
  })

  it('formata horas e minutos', () => {
    expect(formatDuration(3900)).toBe('1 h 5 min')
  })

  it('omite os minutos quando a duração é uma hora cheia', () => {
    expect(formatDuration(7200)).toBe('2 h')
  })

  it('trata duração negativa como não informada', () => {
    expect(formatDuration(-10)).toBe('—')
  })
})
```

- [ ] **Step 8: Rodar o teste e confirmar que ele falha**

Run: `npm test -- src/lib/format.test.ts`
Expected: FAIL — `Failed to resolve import "./format"`.

- [ ] **Step 9: Implementar `formatDuration`**

Crie `src/lib/format.ts`:

```typescript
/** Formata uma duração em segundos para exibição em cards e listas de aula. */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds <= 0) return '—'

  const totalMinutes = Math.max(1, Math.round(seconds / 60))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours === 0) return `${minutes} min`
  if (minutes === 0) return `${hours} h`
  return `${hours} h ${minutes} min`
}
```

- [ ] **Step 10: Rodar os testes e o typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS — 6 testes passando, nenhum erro de tipo.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore: scaffold do Next 16 com Vitest, Playwright e helper de duracao"
```

---

### Task 2: Schema do banco e tipos gerados

**Files:**
- Create: `supabase/config.toml` (via `supabase init`)
- Create: `supabase/migrations/0001_schema_inicial.sql`
- Create: `src/lib/supabase/database.types.ts` (gerado)
- Create: `tests/db/setup.ts`
- Create: `tests/db/client.ts`
- Test: `tests/db/schema.test.ts`

**Interfaces:**
- Consumes: scripts npm da Task 1.
- Produces: todas as tabelas do MVP; o tipo `Database` exportado de `src/lib/supabase/database.types.ts`; o helper de teste `adminClient()` em `tests/db/client.ts`.

- [ ] **Step 1: Inicializar o Supabase e ligar ao projeto de desenvolvimento**

Este projeto usa um **projeto Supabase de desenvolvimento na nuvem**, não o
Supabase local — a máquina não tem Docker. Todos os comandos de banco falam com
esse projeto remoto.

O `.env.local` **já está preenchido e validado** contra o projeto de
desenvolvimento (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`), e
`npx supabase init` já foi executado — `supabase/config.toml` existe.

Não use `supabase link`: ele exige um access token da plataforma, obtido por
login interativo no navegador. Todos os comandos de banco usam `--db-url`, que
autentica direto no Postgres com a senha do banco.

Crie `scripts/db.mjs`, que monta a URL a partir do `.env.local` e repassa os
argumentos para a Supabase CLI:

```javascript
#!/usr/bin/env node
import { spawnSync } from 'node:child_process'

// Node 20.12+ lê o arquivo de ambiente nativamente.
process.loadEnvFile('.env.local')

const ref = process.env.SUPABASE_PROJECT_REF
const senha = process.env.SUPABASE_DB_PASSWORD

if (!ref || !senha) {
  console.error(
    'Faltam SUPABASE_PROJECT_REF e/ou SUPABASE_DB_PASSWORD no .env.local.\n' +
      'Eles estão no painel do Supabase, em Project Settings → Database.',
  )
  process.exit(1)
}

// encodeURIComponent é obrigatório: senhas do Supabase costumam ter !, * e @,
// que quebram a connection string se entrarem cruas.
const dbUrl = `postgresql://postgres:${encodeURIComponent(senha)}@db.${ref}.supabase.co:5432/postgres`

const { status } = spawnSync('npx', ['supabase', ...process.argv.slice(2), '--db-url', dbUrl], {
  stdio: 'inherit',
})

process.exit(status ?? 1)
```

- [ ] **Step 2: Escrever a migration com o schema completo**

Crie `supabase/migrations/0001_schema_inicial.sql`:

```sql
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
-- A pessoa só pode ativar a própria conta, vinda do convite. Nada além disso.
create policy profiles_ativa_a_si on public.profiles
  for update to authenticated
  using (id = auth.uid() and status = 'invited')
  with check (id = auth.uid() and status = 'active');
```

- [ ] **Step 3: Apontar os scripts de banco para o projeto remoto**

A Task 1 registrou os scripts assumindo Supabase local. Substitua-os em
`package.json` pelas versões que falam com o projeto ligado:

```json
{
  "db:push": "node scripts/db.mjs db push --yes",
  "db:reset": "node scripts/db.mjs db reset --yes",
  "db:types": "node scripts/db.mjs gen types typescript > src/lib/supabase/database.types.ts"
}
```

Remova `db:start` e `db:stop` — não existe instância local para subir ou parar.

Flags verificados nesta versão da CLI: `db push`, `db reset` e `gen types` todos
aceitam `--db-url` (que exige a senha percent-encoded, e é o que `scripts/db.mjs`
faz), e `--yes` dispensa a confirmação interativa. Se `gen types typescript` for
recusado como subcomando, use `gen types --lang=typescript` — a CLI aceita as
duas formas conforme a versão.

⚠️ `db:reset` **apaga e recria o banco remoto a partir das migrations**. É o
comportamento desejado neste projeto de desenvolvimento, e é o que dá testes
repetíveis. Nunca aponte esse script para o projeto de produção.

Confirme que `db:types` gerou TypeScript válido, sem log da CLI misturado:
`head -5 src/lib/supabase/database.types.ts` deve começar com `export type Json =`,
e `npm run typecheck` deve passar. Se houver log no arquivo, ajuste
`scripts/db.mjs` para capturar o stdout do filho e escrever só ele.

Ainda assim, escreva todo teste de integração para ser re-executável sem reset —
todos geram slugs e e-mails únicos com `Date.now()`. Mantenha essa disciplina.

- [ ] **Step 4: Aplicar a migration e gerar os tipos**

```bash
npm run db:push
npm run db:types
```

Expected: `db push` aplica `0001_schema_inicial.sql` sem erro, e `src/lib/supabase/database.types.ts` passa a existir com o tipo `Database`.

- [ ] **Step 5: Criar os utilitários de teste de banco**

Crie `tests/db/setup.ts`:

```typescript
import { config } from 'dotenv'

config({ path: '.env.local' })

const required = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(
      `${key} ausente. Preencha o .env.local com as credenciais do projeto Supabase de desenvolvimento antes de rodar "npm run test:db".`,
    )
  }
}
```

Crie `tests/db/client.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

/** Cliente com service_role: ignora RLS. Uso exclusivo de testes e seeds. */
export function adminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

/** Cria um usuário de auth com perfil e devolve o id. */
export async function createTestUser(input: {
  email: string
  fullName: string
  role: 'admin' | 'leader' | 'member'
  areaId?: string | null
  status?: 'invited' | 'active' | 'inactive'
}) {
  const db = adminClient()
  const { data, error } = await db.auth.admin.createUser({
    email: input.email,
    password: 'senha-de-teste-123',
    email_confirm: true,
  })
  if (error || !data.user) throw error ?? new Error('usuário não criado')

  const { error: profileError } = await db.from('profiles').insert({
    id: data.user.id,
    full_name: input.fullName,
    email: input.email,
    role: input.role,
    area_id: input.areaId ?? null,
    status: input.status ?? 'active',
  })
  if (profileError) throw profileError

  return data.user.id
}
```

- [ ] **Step 6: Escrever os testes que falham para as restrições do schema**

Crie `tests/db/schema.test.ts`:

```typescript
import { beforeAll, describe, expect, it } from 'vitest'
import { adminClient, createTestUser } from './client'

const db = adminClient()
let areaId: string
let ownerId: string

beforeAll(async () => {
  const stamp = Date.now()
  const { data: area, error } = await db
    .from('areas')
    .insert({ name: 'Tráfego', slug: `trafego-${stamp}`, position: 1 })
    .select('id')
    .single()
  if (error) throw error
  areaId = area.id
  ownerId = await createTestUser({
    email: `lider-${stamp}@gexcorp.com.br`,
    fullName: 'Líder de Tráfego',
    role: 'leader',
    areaId,
  })
})

describe('restrições do schema', () => {
  it('recusa curso de onboarding com área preenchida', async () => {
    const { error } = await db.from('courses').insert({
      title: 'Trilha Inicial',
      slug: `trilha-invalida-${Date.now()}`,
      is_onboarding: true,
      area_id: areaId,
      owner_id: ownerId,
    })
    expect(error?.message).toContain('courses_onboarding_sem_area')
  })

  it('recusa curso comum sem área', async () => {
    const { error } = await db.from('courses').insert({
      title: 'Curso solto',
      slug: `curso-solto-${Date.now()}`,
      is_onboarding: false,
      area_id: null,
      owner_id: ownerId,
    })
    expect(error?.message).toContain('courses_onboarding_sem_area')
  })

  it('permite apenas uma trilha inicial na plataforma', async () => {
    const first = await db.from('courses').insert({
      title: 'Trilha Inicial',
      slug: `trilha-a-${Date.now()}`,
      is_onboarding: true,
      area_id: null,
      owner_id: ownerId,
    })
    expect(first.error).toBeNull()

    const { error } = await db.from('courses').insert({
      title: 'Outra Trilha Inicial',
      slug: `trilha-b-${Date.now()}`,
      is_onboarding: true,
      area_id: null,
      owner_id: ownerId,
    })
    expect(error?.message).toContain('courses_uma_trilha_inicial')

    // Libera o índice único para os testes seguintes deste arquivo.
    await db.from('courses').delete().like('slug', 'trilha-a-%')
  })

  it('recusa papel fora da lista permitida', async () => {
    const { error } = await db
      .from('profiles')
      // @ts-expect-error papel inválido de propósito
      .update({ role: 'professor' })
      .eq('id', ownerId)
    expect(error?.message).toContain('profiles_role_check')
  })

  it('recusa pergunta acima de 4000 caracteres', async () => {
    const { data: course } = await db
      .from('courses')
      .insert({
        title: 'Curso para fórum',
        slug: `curso-forum-${Date.now()}`,
        area_id: areaId,
        owner_id: ownerId,
      })
      .select('id')
      .single()

    const { data: lesson } = await db
      .from('lessons')
      .insert({
        course_id: course!.id,
        title: 'Aula 1',
        slug: 'aula-1',
        video_provider: 'youtube',
        video_ref: 'dQw4w9WgXcQ',
      })
      .select('id')
      .single()

    const { error } = await db.from('questions').insert({
      lesson_id: lesson!.id,
      author_id: ownerId,
      body: 'x'.repeat(4001),
    })
    expect(error?.message).toContain('questions_body_check')
  })
})
```

A prova de que o RLS está de fato barrando quem não tem sessão entra na Task 6, com um cliente anônimo. Aqui o foco são as restrições de integridade.

- [ ] **Step 7: Rodar os testes de banco e confirmar que passam**

Run: `npm run test:db`
Expected: PASS — 5 testes. Se algum falhar por restrição ausente, corrija `0001_schema_inicial.sql` e rode `npm run db:reset` (que reaplica a migration corrigida do zero), depois repita.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(db): schema inicial do MVP com RLS ligado e testes de restricao"
```

---

### Task 3: A regra de acesso (`canAccessCourse`)

Esta é a tarefa mais importante do plano. É a função que decide quem vê o quê, e um erro aqui vaza conteúdo interno. Ela é **pura**: não toca o banco, não faz I/O, recebe tudo por parâmetro. É isso que a torna testável até o fim.

**Files:**
- Create: `src/lib/access/types.ts`
- Create: `src/lib/access/can-access-course.ts`
- Create: `src/lib/access/index.ts`
- Test: `src/lib/access/can-access-course.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type Role = 'admin' | 'leader' | 'member'`
  - `type UserStatus = 'invited' | 'active' | 'inactive'`
  - `type CourseStatus = 'draft' | 'published'`
  - `type AccessLevel = 'none' | 'view' | 'manage'`
  - `type AccessUser = { id: string; role: Role; status: UserStatus; areaId: string | null }`
  - `type AccessCourse = { id: string; areaId: string | null; status: CourseStatus; isOnboarding: boolean }`
  - `canAccessCourse(user: AccessUser, course: AccessCourse, grantedCourseIds: ReadonlySet<string>): AccessLevel`

- [ ] **Step 1: Definir os tipos compartilhados**

Crie `src/lib/access/types.ts`:

```typescript
export type Role = 'admin' | 'leader' | 'member'
export type UserStatus = 'invited' | 'active' | 'inactive'
export type CourseStatus = 'draft' | 'published'

/**
 * 'none'   — não pode ver o conteúdo (vídeo, anexos, fórum)
 * 'view'   — pode consumir o conteúdo
 * 'manage' — pode consumir e editar o curso e suas aulas
 */
export type AccessLevel = 'none' | 'view' | 'manage'

export type AccessUser = {
  id: string
  role: Role
  status: UserStatus
  areaId: string | null
}

export type AccessCourse = {
  id: string
  areaId: string | null
  status: CourseStatus
  isOnboarding: boolean
}
```

- [ ] **Step 2: Escrever a bateria de testes que falha**

Crie `src/lib/access/can-access-course.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { canAccessCourse } from './can-access-course'
import type { AccessCourse, AccessUser } from './types'

const AREA_TRAFEGO = 'area-trafego'
const AREA_DESIGN = 'area-design'

function user(over: Partial<AccessUser> = {}): AccessUser {
  return { id: 'u1', role: 'member', status: 'active', areaId: AREA_TRAFEGO, ...over }
}

function course(over: Partial<AccessCourse> = {}): AccessCourse {
  return { id: 'c1', areaId: AREA_TRAFEGO, status: 'published', isOnboarding: false, ...over }
}

const semLiberacao = new Set<string>()
const comLiberacao = new Set<string>(['c1'])

describe('canAccessCourse — usuário inativo ou não confirmado', () => {
  it('bloqueia colaborador desativado no curso da própria área', () => {
    expect(canAccessCourse(user({ status: 'inactive' }), course(), semLiberacao)).toBe('none')
  })

  it('bloqueia colaborador ainda não confirmado', () => {
    expect(canAccessCourse(user({ status: 'invited' }), course(), semLiberacao)).toBe('none')
  })

  it('bloqueia admin desativado — status vem antes de papel', () => {
    expect(canAccessCourse(user({ role: 'admin', status: 'inactive' }), course(), semLiberacao)).toBe('none')
  })

  it('bloqueia líder desativado na própria área', () => {
    expect(canAccessCourse(user({ role: 'leader', status: 'inactive' }), course(), semLiberacao)).toBe('none')
  })

  it('ignora liberação individual de usuário desativado', () => {
    expect(canAccessCourse(user({ status: 'inactive' }), course(), comLiberacao)).toBe('none')
  })
})

describe('canAccessCourse — admin', () => {
  it('gerencia qualquer curso publicado', () => {
    expect(canAccessCourse(user({ role: 'admin', areaId: null }), course(), semLiberacao)).toBe('manage')
  })

  it('gerencia curso em rascunho', () => {
    expect(canAccessCourse(user({ role: 'admin' }), course({ status: 'draft' }), semLiberacao)).toBe('manage')
  })

  it('gerencia curso de área que não é a dele', () => {
    expect(canAccessCourse(user({ role: 'admin', areaId: AREA_DESIGN }), course(), semLiberacao)).toBe('manage')
  })
})

describe('canAccessCourse — líder', () => {
  it('gerencia curso publicado da sua área', () => {
    expect(canAccessCourse(user({ role: 'leader' }), course(), semLiberacao)).toBe('manage')
  })

  it('gerencia rascunho da sua área', () => {
    expect(canAccessCourse(user({ role: 'leader' }), course({ status: 'draft' }), semLiberacao)).toBe('manage')
  })

  it('não gerencia curso de outra área — cai na regra de colaborador comum', () => {
    const level = canAccessCourse(user({ role: 'leader' }), course({ areaId: AREA_DESIGN }), semLiberacao)
    expect(level).toBe('none')
  })

  it('vê curso de outra área quando tem liberação individual', () => {
    const level = canAccessCourse(user({ role: 'leader' }), course({ areaId: AREA_DESIGN }), comLiberacao)
    expect(level).toBe('view')
  })

  it('não gerencia a trilha inicial, apenas assiste', () => {
    const level = canAccessCourse(user({ role: 'leader' }), course({ areaId: null, isOnboarding: true }), semLiberacao)
    expect(level).toBe('view')
  })

  it('não gerencia rascunho de outra área nem com liberação individual', () => {
    const level = canAccessCourse(
      user({ role: 'leader' }),
      course({ areaId: AREA_DESIGN, status: 'draft' }),
      comLiberacao,
    )
    expect(level).toBe('none')
  })
})

describe('canAccessCourse — colaborador', () => {
  it('vê curso publicado da sua área', () => {
    expect(canAccessCourse(user(), course(), semLiberacao)).toBe('view')
  })

  it('não vê curso publicado de outra área', () => {
    expect(canAccessCourse(user(), course({ areaId: AREA_DESIGN }), semLiberacao)).toBe('none')
  })

  it('vê curso de outra área com liberação individual', () => {
    expect(canAccessCourse(user(), course({ areaId: AREA_DESIGN }), comLiberacao)).toBe('view')
  })

  it('vê a trilha inicial mesmo sem área definida', () => {
    const level = canAccessCourse(
      user({ areaId: null }),
      course({ areaId: null, isOnboarding: true }),
      semLiberacao,
    )
    expect(level).toBe('view')
  })

  it('não vê a trilha inicial enquanto ela estiver em rascunho', () => {
    const level = canAccessCourse(
      user(),
      course({ areaId: null, isOnboarding: true, status: 'draft' }),
      semLiberacao,
    )
    expect(level).toBe('none')
  })

  it('não vê rascunho da própria área', () => {
    expect(canAccessCourse(user(), course({ status: 'draft' }), semLiberacao)).toBe('none')
  })

  it('não vê rascunho nem com liberação individual', () => {
    expect(canAccessCourse(user(), course({ status: 'draft' }), comLiberacao)).toBe('none')
  })

  it('sem área definida, não vê curso de área alguma', () => {
    expect(canAccessCourse(user({ areaId: null }), course(), semLiberacao)).toBe('none')
  })

  it('não confunde área nula do usuário com área nula do curso', () => {
    const level = canAccessCourse(
      user({ areaId: null }),
      course({ areaId: null, isOnboarding: false }),
      semLiberacao,
    )
    expect(level).toBe('none')
  })
})
```

O **último** teste é o que protege contra o bug mais provável desta função: comparar `user.areaId === course.areaId` quando ambos são `null` e conceder acesso a quem não tem setor. Ele é o único que falharia se a guarda `!== null` fosse removida — o penúltimo (área nula contra curso com área) passa nas duas implementações, então não segure regressão nele. A restrição do banco impede curso comum sem área, mas a função não pode depender disso.

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npm test -- src/lib/access`
Expected: FAIL — `Failed to resolve import "./can-access-course"`.

- [ ] **Step 4: Implementar a função**

Crie `src/lib/access/can-access-course.ts`:

```typescript
import type { AccessCourse, AccessLevel, AccessUser } from './types'

/**
 * Decide o nível de acesso de uma pessoa a um curso.
 *
 * Função pura de propósito: recebe tudo por parâmetro e não toca banco nem rede.
 * É a única fonte da regra de autorização da aplicação — a política RLS
 * `can_access_course` no Postgres espelha exatamente esta ordem.
 *
 * @param grantedCourseIds ids dos cursos liberados individualmente para este usuário
 *                         (linhas de `course_access`). Acesso pela área NÃO aparece aqui.
 */
export function canAccessCourse(
  user: AccessUser,
  course: AccessCourse,
  grantedCourseIds: ReadonlySet<string>,
): AccessLevel {
  // 1. Só quem está ativo acessa qualquer coisa — inclusive admin.
  if (user.status !== 'active') return 'none'

  // 2. Admin gerencia tudo, inclusive rascunhos.
  if (user.role === 'admin') return 'manage'

  // 3. Líder gerencia os cursos da sua própria área, inclusive rascunhos.
  //    A comparação exige área definida dos dois lados: a trilha inicial tem
  //    area_id nulo e não pertence a líder nenhum.
  if (user.role === 'leader' && user.areaId !== null && user.areaId === course.areaId) {
    return 'manage'
  }

  // 4. Daqui para baixo, rascunho é invisível.
  if (course.status !== 'published') return 'none'

  // 5. Trilha inicial: todo colaborador ativo assiste.
  if (course.isOnboarding) return 'view'

  // 6. Conteúdo do próprio setor. Ambos os lados precisam ter área definida.
  if (user.areaId !== null && user.areaId === course.areaId) return 'view'

  // 7. Liberação individual concedida pelo admin.
  if (grantedCourseIds.has(course.id)) return 'view'

  // 8. Bloqueado: a capa aparece na vitrine, o conteúdo não.
  return 'none'
}
```

- [ ] **Step 5: Criar o barrel de exportação**

Crie `src/lib/access/index.ts`:

```typescript
export { canAccessCourse } from './can-access-course'
export type {
  AccessCourse,
  AccessLevel,
  AccessUser,
  CourseStatus,
  Role,
  UserStatus,
} from './types'
```

- [ ] **Step 6: Rodar os testes e confirmar que passam**

Run: `npm test -- src/lib/access`
Expected: PASS — 23 testes.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(access): regra de acesso a cursos como funcao pura testada"
```

---

### Task 4: Clientes Supabase, sessão e proteção de rotas

**Files:**
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/admin.ts`
- Create: `src/lib/auth/session.ts`
- Create: `src/lib/auth/guards.ts`
- Create: `src/lib/auth/public-routes.ts`
- Create: `src/proxy.ts`
- Test: `src/lib/auth/public-routes.test.ts`
- Create: `src/server/result.ts`
- Test: `src/lib/auth/guards.test.ts`

**Interfaces:**
- Consumes: `Role`, `AccessUser` de `src/lib/access`; `Database` de `src/lib/supabase/database.types`.
- Produces:
  - `createServerSupabase(): Promise<SupabaseClient<Database>>` em `src/lib/supabase/server.ts`
  - `createBrowserSupabase(): SupabaseClient<Database>` em `src/lib/supabase/client.ts`
  - `createAdminSupabase(): SupabaseClient<Database>` em `src/lib/supabase/admin.ts`
  - `type CurrentUser = AccessUser & { fullName: string; email: string; avatarUrl: string | null }`
  - `getCurrentUser(): Promise<CurrentUser | null>` em `src/lib/auth/session.ts`
  - `assertRole(user: CurrentUser | null, roles: Role[]): CurrentUser` em `src/lib/auth/guards.ts`
  - `ehRotaPublica(pathname: string): boolean` em `src/lib/auth/public-routes.ts`
  - `type ActionResult<T>`, `ok()`, `fail()` em `src/server/result.ts`

- [ ] **Step 1: Criar o cliente de servidor**

Crie `src/lib/supabase/server.ts`:

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from './database.types'

/** Cliente ligado à sessão do usuário. Respeita RLS. */
export async function createServerSupabase() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Chamado de um Server Component: o proxy.ts cuida da renovação.
          }
        },
      },
    },
  )
}
```

- [ ] **Step 2: Criar os clientes de navegador e de serviço**

Crie `src/lib/supabase/client.ts`:

```typescript
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types'

/** Cliente do navegador. Usado apenas para login, logout e troca de senha. */
export function createBrowserSupabase() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )
}
```

Crie `src/lib/supabase/admin.ts`:

```typescript
import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

/**
 * Cliente com service_role: ignora RLS por completo.
 *
 * Só pode ser usado em operações administrativas que já verificaram o papel
 * do chamador (convidar pessoa, gerar link assinado, decidir solicitação).
 * O import de 'server-only' faz o build quebrar se este arquivo for puxado
 * para um componente de cliente.
 */
export function createAdminSupabase() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
```

```bash
npm install server-only
```

- [ ] **Step 3: Escrever o teste que falha para os guards de papel**

Crie `src/lib/auth/guards.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { assertRole, ForbiddenError, UnauthenticatedError } from './guards'
import type { CurrentUser } from './session'

function currentUser(over: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: 'u1',
    role: 'member',
    status: 'active',
    areaId: 'area-1',
    fullName: 'Colaborador',
    email: 'colaborador@gexcorp.com.br',
    avatarUrl: null,
    ...over,
  }
}

describe('assertRole', () => {
  it('lança UnauthenticatedError quando não há usuário', () => {
    expect(() => assertRole(null, ['member'])).toThrow(UnauthenticatedError)
  })

  it('devolve o usuário quando o papel está na lista', () => {
    const user = currentUser({ role: 'leader' })
    expect(assertRole(user, ['leader', 'admin'])).toBe(user)
  })

  it('lança ForbiddenError quando o papel não está na lista', () => {
    expect(() => assertRole(currentUser(), ['admin'])).toThrow(ForbiddenError)
  })

  it('lança ForbiddenError para usuário desativado mesmo com o papel certo', () => {
    const user = currentUser({ role: 'admin', status: 'inactive' })
    expect(() => assertRole(user, ['admin'])).toThrow(ForbiddenError)
  })

  it('lança ForbiddenError para usuário ainda não confirmado', () => {
    const user = currentUser({ role: 'admin', status: 'invited' })
    expect(() => assertRole(user, ['admin'])).toThrow(ForbiddenError)
  })
})
```

- [ ] **Step 4: Rodar e confirmar que falha**

Run: `npm test -- src/lib/auth`
Expected: FAIL — `Failed to resolve import "./guards"`.

- [ ] **Step 5: Implementar sessão e guards**

Crie `src/lib/auth/session.ts`:

```typescript
import 'server-only'
import { cache } from 'react'
import { createServerSupabase } from '@/lib/supabase/server'
import type { AccessUser, Role, UserStatus } from '@/lib/access'

export type CurrentUser = AccessUser & {
  fullName: string
  email: string
  avatarUrl: string | null
}

/**
 * Usuário da requisição atual, com o perfil já carregado.
 * Memoizado por requisição com `cache`, para não consultar o banco em cada
 * componente que precisa saber quem está logado.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createServerSupabase()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, email, avatar_url, role, area_id, status')
    .eq('id', user.id)
    .single()
  if (!profile) return null

  return {
    id: profile.id,
    role: profile.role as Role,
    status: profile.status as UserStatus,
    areaId: profile.area_id,
    fullName: profile.full_name,
    email: profile.email,
    avatarUrl: profile.avatar_url,
  }
})
```

Crie `src/lib/auth/guards.ts`:

```typescript
import type { Role } from '@/lib/access'
import type { CurrentUser } from './session'

export class UnauthenticatedError extends Error {
  constructor() {
    super('Sessão não encontrada.')
    this.name = 'UnauthenticatedError'
  }
}

export class ForbiddenError extends Error {
  constructor() {
    super('Você não tem permissão para esta ação.')
    this.name = 'ForbiddenError'
  }
}

/**
 * Confirma que existe um usuário ativo com um dos papéis informados.
 * Função pura para poder ser testada sem sessão nem banco.
 */
export function assertRole(user: CurrentUser | null, roles: Role[]): CurrentUser {
  if (!user) throw new UnauthenticatedError()
  if (user.status !== 'active') throw new ForbiddenError()
  if (!roles.includes(user.role)) throw new ForbiddenError()
  return user
}
```

- [ ] **Step 6: Criar o tipo de retorno das server actions**

Crie `src/server/result.ts`:

```typescript
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

export function fail(error: string): ActionResult<never> {
  return { ok: false, error }
}

/**
 * Converte exceções conhecidas em mensagem para a tela.
 * Erro inesperado vira mensagem genérica e vai para o log — nunca vaza detalhe
 * de banco para o usuário.
 */
export function toActionError(error: unknown): ActionResult<never> {
  if (error instanceof Error) {
    if (error.name === 'UnauthenticatedError') return fail('Faça login para continuar.')
    if (error.name === 'ForbiddenError') return fail('Você não tem permissão para esta ação.')
  }
  console.error('[action]', error)
  return fail('Não foi possível concluir a ação. Tente novamente.')
}
```

- [ ] **Step 7: Criar o predicado de rota pública**

Crie `src/lib/auth/public-routes.ts`:

```typescript
export const ROTAS_PUBLICAS = ['/login', '/convite', '/recuperar-senha', '/nova-senha', '/auth']

/**
 * Uma rota é pública quando é exatamente uma das listadas, ou um caminho abaixo
 * dela.
 *
 * Comparar por prefixo solto (`pathname.startsWith(rota)`) tornaria `/authors`
 * pública só porque começa com `/auth` — e a falha seria silenciosa, sem erro e
 * sem teste vermelho. Por isso a fronteira `/` é obrigatória.
 */
export function ehRotaPublica(pathname: string): boolean {
  return ROTAS_PUBLICAS.some((rota) => pathname === rota || pathname.startsWith(`${rota}/`))
}
```

Escreva `src/lib/auth/public-routes.test.ts` cobrindo, no mínimo: cada rota
listada casando exatamente; subcaminhos (`/auth/confirm`, `/convite/aceitar`)
casando; e os quase-acertos **não** casando (`/authors`, `/login-history`,
`/auth-log`, `/convites`), além de `/` e `/admin/pessoas`. Os quase-acertos são o
motivo deste módulo existir.

- [ ] **Step 8: Criar o `proxy.ts` que renova a sessão e protege as rotas**

Crie `src/proxy.ts` (Next 16 — o nome `middleware.ts` está descontinuado):

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { ehRotaPublica } from '@/lib/auth/public-routes'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value),
          )
        },
      },
    },
  )

  // Não coloque código entre createServerClient e getUser: um erro aqui causa
  // logout aleatório e é muito difícil de depurar.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const ehPublica = ehRotaPublica(request.nextUrl.pathname)

  if (!user && !ehPublica) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  // Devolva supabaseResponse como está: recriá-lo dessincroniza os cookies e
  // encerra a sessão do usuário antes da hora.
  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

- [ ] **Step 9: Rodar os testes, o typecheck e o build**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS — testes de guards e de rota pública passando, nenhum erro de tipo, build concluído (o build é o que prova que o `proxy.ts` compila sob o Next 16).

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(auth): clientes supabase, sessao memoizada, guards de papel e proxy do Next 16"
```

---

### Task 5: Layout, tokens de design e navegação por papel

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`
- Create: `src/components/layout/app-shell.tsx`
- Create: `src/components/layout/nav-links.tsx`
- Create: `src/components/ui/button.tsx`
- Create: `src/components/ui/input.tsx`
- Create: `src/components/ui/field.tsx`
- Create: `src/lib/cn.ts`
- Test: `src/components/layout/nav-links.test.tsx`

**Interfaces:**
- Consumes: `CurrentUser` de `src/lib/auth/session`, `Role` de `src/lib/access`.
- Produces:
  - `cn(...classes)` em `src/lib/cn.ts`
  - `navLinksForRole(role: Role): { href: string; label: string }[]` em `src/components/layout/nav-links.tsx`
  - `<AppShell user={user}>{children}</AppShell>` em `src/components/layout/app-shell.tsx`
  - `<Button>`, `<Input>`, `<Field>` em `src/components/ui/`

- [ ] **Step 1: Criar o helper de classes**

```bash
npm install clsx tailwind-merge
```

Crie `src/lib/cn.ts`:

```typescript
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 2: Definir os tokens de design**

Substitua o conteúdo de `src/app/globals.css` por:

```css
@import 'tailwindcss';

/*
 * Identidade visual da GEX Academy.
 * Enquanto o manual de marca não chega, estes valores são provisórios.
 * Trocar a identidade definitiva significa alterar SOMENTE este bloco —
 * nenhum componente cita cor literal.
 */
@theme {
  --color-marca-50: #eef4ff;
  --color-marca-100: #d9e6ff;
  --color-marca-500: #2f6bff;
  --color-marca-600: #1d4fd8;
  --color-marca-700: #1a3fae;

  --color-superficie: #ffffff;
  --color-fundo: #f6f7f9;
  --color-borda: #e3e6ea;
  --color-texto: #14181f;
  --color-texto-suave: #5b6472;

  --color-perigo: #c02626;
  --color-sucesso: #1f8a4c;
  --color-aviso: #a86b00;

  --radius-card: 0.75rem;
}

html {
  color-scheme: light;
}

body {
  background-color: var(--color-fundo);
  color: var(--color-texto);
}
```

- [ ] **Step 3: Escrever o teste que falha para a navegação por papel**

Crie `src/components/layout/nav-links.test.tsx`:

```typescript
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { navLinksForRole } from './nav-links'

describe('navLinksForRole', () => {
  it('colaborador vê apenas início e perfil', () => {
    const hrefs = navLinksForRole('member').map((l) => l.href)
    expect(hrefs).toEqual(['/', '/perfil'])
  })

  it('líder ganha gerenciar e a fila de dúvidas', () => {
    const hrefs = navLinksForRole('leader').map((l) => l.href)
    expect(hrefs).toEqual(['/', '/gerenciar', '/gerenciar/duvidas', '/perfil'])
  })

  it('admin ganha as telas administrativas', () => {
    const hrefs = navLinksForRole('admin').map((l) => l.href)
    expect(hrefs).toEqual([
      '/',
      '/gerenciar',
      '/gerenciar/duvidas',
      '/admin/pessoas',
      '/admin/areas',
      '/admin/solicitacoes',
      '/admin/progresso',
      '/perfil',
    ])
  })

  it('nenhum link administrativo escapa para colaborador', () => {
    const hrefs = navLinksForRole('member').map((l) => l.href)
    expect(hrefs.some((h) => h.startsWith('/admin'))).toBe(false)
    expect(hrefs.some((h) => h.startsWith('/gerenciar'))).toBe(false)
  })
})
```

- [ ] **Step 4: Rodar e confirmar que falha**

Run: `npm test -- src/components/layout`
Expected: FAIL — `Failed to resolve import "./nav-links"`.

- [ ] **Step 5: Implementar a navegação**

Crie `src/components/layout/nav-links.tsx`:

```typescript
import type { Role } from '@/lib/access'

export type NavLink = { href: string; label: string }

const INICIO: NavLink = { href: '/', label: 'Início' }
const PERFIL: NavLink = { href: '/perfil', label: 'Perfil' }

const GESTAO: NavLink[] = [
  { href: '/gerenciar', label: 'Gerenciar' },
  { href: '/gerenciar/duvidas', label: 'Dúvidas' },
]

const ADMIN: NavLink[] = [
  { href: '/admin/pessoas', label: 'Pessoas' },
  { href: '/admin/areas', label: 'Áreas' },
  { href: '/admin/solicitacoes', label: 'Solicitações' },
  { href: '/admin/progresso', label: 'Progresso' },
]

/**
 * Links visíveis para cada papel.
 * Isto é navegação, não autorização: cada rota revalida a permissão no servidor.
 */
export function navLinksForRole(role: Role): NavLink[] {
  if (role === 'admin') return [INICIO, ...GESTAO, ...ADMIN, PERFIL]
  if (role === 'leader') return [INICIO, ...GESTAO, PERFIL]
  return [INICIO, PERFIL]
}
```

- [ ] **Step 6: Criar as primitivas de interface**

Crie `src/components/ui/button.tsx`:

```typescript
import { cn } from '@/lib/cn'
import type { ButtonHTMLAttributes } from 'react'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primario' | 'secundario' | 'perigo'
}

export function Button({ variant = 'primario', className, ...props }: Props) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primario' && 'bg-marca-600 text-white hover:bg-marca-700',
        variant === 'secundario' &&
          'border border-borda bg-superficie text-texto hover:bg-fundo',
        variant === 'perigo' && 'bg-perigo text-white hover:opacity-90',
        className,
      )}
      {...props}
    />
  )
}
```

Crie `src/components/ui/input.tsx`:

```typescript
import { cn } from '@/lib/cn'
import type { InputHTMLAttributes } from 'react'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full rounded-lg border border-borda bg-superficie px-3 py-2 text-sm',
        'outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-100',
        className,
      )}
      {...props}
    />
  )
}
```

Crie `src/components/ui/field.tsx`:

```typescript
import type { ReactNode } from 'react'

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string
  htmlFor: string
  hint?: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-texto">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-texto-suave">{hint}</p>}
      {error && (
        <p role="alert" className="text-xs text-perigo">
          {error}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 7: Montar o AppShell e o layout raiz**

Crie `src/components/layout/app-shell.tsx`:

```typescript
import Link from 'next/link'
import type { ReactNode } from 'react'
import type { CurrentUser } from '@/lib/auth/session'
import { navLinksForRole } from './nav-links'

export function AppShell({ user, children }: { user: CurrentUser; children: ReactNode }) {
  const links = navLinksForRole(user.role)

  return (
    <div className="min-h-screen">
      <header className="border-b border-borda bg-superficie">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <Link href="/" className="text-base font-semibold text-marca-600">
            GEX Academy
          </Link>
          <nav aria-label="Principal" className="flex flex-1 gap-4">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-texto-suave hover:text-texto"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <span className="text-sm text-texto-suave">{user.fullName}</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  )
}
```

Substitua `src/app/layout.tsx` por:

```typescript
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'GEX Academy',
  description: 'Plataforma de ensino interna da GEX.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 8: Rodar testes, typecheck e build**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS — 4 testes de navegação, build concluído.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(ui): tokens de design, primitivas e navegacao por papel"
```

---

### Task 6: Áreas — CRUD do admin

**Files:**
- Create: `src/server/areas.ts`
- Create: `src/app/(admin)/layout.tsx`
- Create: `src/app/(admin)/admin/areas/page.tsx`
- Create: `src/app/(admin)/admin/areas/area-form.tsx`
- Create: `src/lib/slug.ts`
- Test: `src/lib/slug.test.ts`
- Test: `tests/db/areas.test.ts`

**Interfaces:**
- Consumes: `assertRole`, `getCurrentUser`, `ActionResult`, `createServerSupabase`.
- Produces:
  - `slugify(text: string): string` em `src/lib/slug.ts`
  - `listAreas(): Promise<AreaRow[]>`, `createArea(formData)`, `updateArea(formData)` em `src/server/areas.ts`
  - `type AreaRow = { id: string; name: string; slug: string; description: string | null; color: string | null; position: number }`

- [ ] **Step 1: Escrever o teste que falha para `slugify`**

Crie `src/lib/slug.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { slugify } from './slug'

describe('slugify', () => {
  it('remove acentos e normaliza para minúsculas', () => {
    expect(slugify('Gestão de Tráfego')).toBe('gestao-de-trafego')
  })

  it('troca espaços e símbolos por hífen único', () => {
    expect(slugify('Copy  &  Criação!!')).toBe('copy-criacao')
  })

  it('remove hífens das pontas', () => {
    expect(slugify('  -- Design --  ')).toBe('design')
  })

  it('preserva números', () => {
    expect(slugify('Meta Ads 2026')).toBe('meta-ads-2026')
  })

  it('devolve string vazia quando não sobra caractere válido', () => {
    expect(slugify('!!!')).toBe('')
  })

  it('trata o ç corretamente', () => {
    expect(slugify('Infraestrutura & Segurança')).toBe('infraestrutura-seguranca')
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- src/lib/slug.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar `slugify`**

Crie `src/lib/slug.ts`:

```typescript
/** Converte um título em slug de URL: sem acento, minúsculo, separado por hífen. */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove os acentos separados pelo NFD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- src/lib/slug.test.ts`
Expected: PASS — 6 testes.

- [ ] **Step 5: Implementar as server actions de áreas**

Crie `src/server/areas.ts`:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { assertRole } from '@/lib/auth/guards'
import { getCurrentUser } from '@/lib/auth/session'
import { slugify } from '@/lib/slug'
import { createServerSupabase } from '@/lib/supabase/server'
import { ok, toActionError, type ActionResult } from './result'

export type AreaRow = {
  id: string
  name: string
  slug: string
  description: string | null
  color: string | null
  position: number
}

const areaSchema = z.object({
  name: z.string().trim().min(2, 'O nome precisa de ao menos 2 caracteres.').max(60),
  description: z.string().trim().max(280).optional().or(z.literal('')),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Use uma cor no formato #RRGGBB.')
    .optional()
    .or(z.literal('')),
  position: z.coerce.number().int().min(0).max(999).default(0),
})

export async function listAreas(): Promise<AreaRow[]> {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('areas')
    .select('id, name, slug, description, color, position')
    .order('position')
    .order('name')
  return data ?? []
}

export async function createArea(_prev: unknown, formData: FormData): Promise<ActionResult<AreaRow>> {
  try {
    assertRole(await getCurrentUser(), ['admin'])

    const parsed = areaSchema.safeParse(Object.fromEntries(formData))
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message }
    }

    const slug = slugify(parsed.data.name)
    if (!slug) return { ok: false, error: 'O nome precisa conter letras ou números.' }

    const supabase = await createServerSupabase()
    const { data, error } = await supabase
      .from('areas')
      .insert({
        name: parsed.data.name,
        slug,
        description: parsed.data.description || null,
        color: parsed.data.color || null,
        position: parsed.data.position,
      })
      .select('id, name, slug, description, color, position')
      .single()

    if (error) {
      if (error.code === '23505') return { ok: false, error: 'Já existe uma área com esse nome.' }
      throw error
    }

    revalidatePath('/admin/areas')
    return ok(data)
  } catch (error) {
    return toActionError(error)
  }
}

export async function updateArea(_prev: unknown, formData: FormData): Promise<ActionResult<AreaRow>> {
  try {
    assertRole(await getCurrentUser(), ['admin'])

    const id = z.string().uuid().safeParse(formData.get('id'))
    if (!id.success) return { ok: false, error: 'Área inválida.' }

    const parsed = areaSchema.safeParse(Object.fromEntries(formData))
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

    const supabase = await createServerSupabase()
    const { data, error } = await supabase
      .from('areas')
      .update({
        name: parsed.data.name,
        description: parsed.data.description || null,
        color: parsed.data.color || null,
        position: parsed.data.position,
      })
      .eq('id', id.data)
      .select('id, name, slug, description, color, position')
      .single()

    if (error) throw error

    revalidatePath('/admin/areas')
    return ok(data)
  } catch (error) {
    return toActionError(error)
  }
}
```

O `slug` não muda depois de criado: ele já é referência em URL e em conteúdo publicado.

- [ ] **Step 6: Criar o layout administrativo e a tela de áreas**

Crie `src/app/(admin)/layout.tsx`:

```typescript
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { AppShell } from '@/components/layout/app-shell'
import { getCurrentUser } from '@/lib/auth/session'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (user.role !== 'admin' || user.status !== 'active') redirect('/')

  return <AppShell user={user}>{children}</AppShell>
}
```

Crie `src/app/(admin)/admin/areas/page.tsx`:

```typescript
import { listAreas } from '@/server/areas'
import { AreaForm } from './area-form'

export const metadata = { title: 'Áreas — GEX Academy' }

export default async function AreasPage() {
  const areas = await listAreas()

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_320px]">
      <section>
        <h1 className="mb-4 text-xl font-semibold">Áreas</h1>
        {areas.length === 0 ? (
          <p className="text-sm text-texto-suave">
            Nenhuma área cadastrada. Crie a primeira ao lado.
          </p>
        ) : (
          <ul className="divide-y divide-borda rounded-card border border-borda bg-superficie">
            {areas.map((area) => (
              <li key={area.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  aria-hidden
                  className="size-3 rounded-full border border-borda"
                  style={{ backgroundColor: area.color ?? 'transparent' }}
                />
                <div className="flex-1">
                  <p className="text-sm font-medium">{area.name}</p>
                  <p className="text-xs text-texto-suave">/{area.slug}</p>
                </div>
                <span className="text-xs text-texto-suave">posição {area.position}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-texto-suave">
          Nova área
        </h2>
        <AreaForm />
      </aside>
    </div>
  )
}
```

Crie `src/app/(admin)/admin/areas/area-form.tsx`:

```typescript
'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { createArea } from '@/server/areas'

export function AreaForm() {
  const [state, action, pending] = useActionState(createArea, null)

  return (
    <form action={action} className="flex flex-col gap-4 rounded-card border border-borda bg-superficie p-4">
      <Field label="Nome" htmlFor="name" hint="Ex.: Gestão de Tráfego">
        <Input id="name" name="name" required maxLength={60} />
      </Field>
      <Field label="Descrição" htmlFor="description">
        <Input id="description" name="description" maxLength={280} />
      </Field>
      <Field label="Cor" htmlFor="color" hint="Formato #RRGGBB">
        <Input id="color" name="color" placeholder="#2F6BFF" />
      </Field>
      <Field label="Posição" htmlFor="position" hint="Ordem na vitrine">
        <Input id="position" name="position" type="number" min={0} max={999} defaultValue={0} />
      </Field>

      {state && !state.ok && (
        <p role="alert" className="text-xs text-perigo">
          {state.error}
        </p>
      )}
      {state?.ok && <p className="text-xs text-sucesso">Área criada.</p>}

      <Button type="submit" disabled={pending}>
        {pending ? 'Salvando…' : 'Criar área'}
      </Button>
    </form>
  )
}
```

- [ ] **Step 7: Escrever o teste de integração das áreas**

Crie `tests/db/areas.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { adminClient } from './client'

const db = adminClient()

describe('tabela areas', () => {
  it('impede duas áreas com o mesmo slug', async () => {
    const slug = `design-${Date.now()}`
    const primeira = await db.from('areas').insert({ name: 'Design', slug })
    expect(primeira.error).toBeNull()

    const { error } = await db.from('areas').insert({ name: 'Design', slug })
    expect(error?.code).toBe('23505')
  })

  it('bloqueia leitura sem sessão porque o RLS está ligado', async () => {
    const { createClient } = await import('@supabase/supabase-js')
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false } },
    )
    const { data } = await anon.from('areas').select('id')
    expect(data).toEqual([])
  })
})
```

O segundo teste é a prova de que o RLS está de fato barrando quem não tem sessão. Ele precisa que `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` esteja no `.env.local`.

- [ ] **Step 8: Rodar tudo**

Run: `npm test && npm run test:db && npm run typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(admin): cadastro de areas com validacao zod e teste de RLS"
```

---

### Task 7: Pessoas — convite, papel, área e desativação

**Files:**
- Create: `src/server/people.ts`
- Create: `src/app/(admin)/admin/pessoas/page.tsx`
- Create: `src/app/(admin)/admin/pessoas/invite-form.tsx`
- Create: `src/app/(admin)/admin/pessoas/person-row.tsx`
- Test: `tests/db/people.test.ts`

**Interfaces:**
- Consumes: `assertRole`, `getCurrentUser`, `createAdminSupabase`, `createServerSupabase`, `listAreas`, `ActionResult`.
- Produces:
  - `type PersonRow = { id: string; fullName: string; email: string; role: Role; areaId: string | null; areaName: string | null; status: UserStatus }`
  - `listPeople(): Promise<PersonRow[]>`
  - `invitePerson(_prev, formData): Promise<ActionResult<{ id: string }>>`
  - `updatePerson(_prev, formData): Promise<ActionResult<{ id: string }>>`
  - `setPersonStatus(_prev, formData): Promise<ActionResult<{ id: string }>>`

- [ ] **Step 1: Implementar as server actions de pessoas**

Crie `src/server/people.ts`:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { Role, UserStatus } from '@/lib/access'
import { assertRole } from '@/lib/auth/guards'
import { getCurrentUser } from '@/lib/auth/session'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createServerSupabase } from '@/lib/supabase/server'
import { ok, toActionError, type ActionResult } from './result'

export type PersonRow = {
  id: string
  fullName: string
  email: string
  role: Role
  areaId: string | null
  areaName: string | null
  status: UserStatus
}

const papel = z.enum(['admin', 'leader', 'member'])

const inviteSchema = z
  .object({
    fullName: z.string().trim().min(3, 'Informe o nome completo.').max(120),
    email: z.string().trim().toLowerCase().email('E-mail inválido.'),
    role: papel,
    areaId: z.string().uuid().optional().or(z.literal('')),
  })
  .refine((v) => v.role === 'admin' || !!v.areaId, {
    message: 'Colaboradores e líderes precisam de uma área.',
    path: ['areaId'],
  })

export async function listPeople(): Promise<PersonRow[]> {
  // Este arquivo é 'use server': cada export é um endpoint chamável. O RLS já
  // limitaria o retorno, mas a checagem explícita é a regra do projeto.
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin' || user.status !== 'active') return []

  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, area_id, status, areas(name)')
    .order('full_name')

  return (data ?? []).map((row) => ({
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role as Role,
    areaId: row.area_id,
    areaName: (row.areas as { name: string } | null)?.name ?? null,
    status: row.status as UserStatus,
  }))
}

export async function invitePerson(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    assertRole(await getCurrentUser(), ['admin'])

    const parsed = inviteSchema.safeParse(Object.fromEntries(formData))
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

    const { fullName, email, role, areaId } = parsed.data
    const admin = createAdminSupabase()

    // O convite do Supabase Auth envia o e-mail e cria o usuário sem senha.
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/convite`,
      data: { full_name: fullName },
    })

    if (error) {
      if (error.message.toLowerCase().includes('already')) {
        return { ok: false, error: 'Já existe uma conta com esse e-mail.' }
      }
      throw error
    }

    const { error: profileError } = await admin.from('profiles').insert({
      id: data.user.id,
      full_name: fullName,
      email,
      role,
      area_id: role === 'admin' ? (areaId || null) : areaId!,
      status: 'invited',
    })

    if (profileError) {
      // Sem perfil o usuário não consegue usar nada: desfaz o convite para não
      // deixar uma conta órfã no Auth.
      await admin.auth.admin.deleteUser(data.user.id)
      throw profileError
    }

    revalidatePath('/admin/pessoas')
    return ok({ id: data.user.id })
  } catch (error) {
    return toActionError(error)
  }
}

const updateSchema = z
  .object({
    id: z.string().uuid(),
    role: papel,
    areaId: z.string().uuid().optional().or(z.literal('')),
  })
  .refine((v) => v.role === 'admin' || !!v.areaId, {
    message: 'Colaboradores e líderes precisam de uma área.',
    path: ['areaId'],
  })

export async function updatePerson(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const currentUser = assertRole(await getCurrentUser(), ['admin'])

    const parsed = updateSchema.safeParse(Object.fromEntries(formData))
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

    if (parsed.data.id === currentUser.id && parsed.data.role !== 'admin') {
      return { ok: false, error: 'Você não pode remover o próprio acesso de admin.' }
    }

    const supabase = await createServerSupabase()
    const { error } = await supabase
      .from('profiles')
      .update({ role: parsed.data.role, area_id: parsed.data.areaId || null })
      .eq('id', parsed.data.id)

    if (error) throw error

    revalidatePath('/admin/pessoas')
    return ok({ id: parsed.data.id })
  } catch (error) {
    return toActionError(error)
  }
}

const statusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['active', 'inactive']),
})

export async function setPersonStatus(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const currentUser = assertRole(await getCurrentUser(), ['admin'])

    const parsed = statusSchema.safeParse(Object.fromEntries(formData))
    if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }

    if (parsed.data.id === currentUser.id && parsed.data.status === 'inactive') {
      return { ok: false, error: 'Você não pode desativar a si mesmo.' }
    }

    const supabase = await createServerSupabase()
    const { error } = await supabase
      .from('profiles')
      .update({ status: parsed.data.status })
      .eq('id', parsed.data.id)

    if (error) throw error

    revalidatePath('/admin/pessoas')
    return ok({ id: parsed.data.id })
  } catch (error) {
    return toActionError(error)
  }
}
```

As duas guardas contra autossabotagem (`não pode remover o próprio admin`, `não pode desativar a si mesmo`) evitam o cenário em que o único admin se tranca para fora da plataforma.

- [ ] **Step 2: Criar a tela de pessoas**

Crie `src/app/(admin)/admin/pessoas/page.tsx`:

```typescript
import { listAreas } from '@/server/areas'
import { listPeople } from '@/server/people'
import { InviteForm } from './invite-form'
import { PersonRowItem } from './person-row'

export const metadata = { title: 'Pessoas — GEX Academy' }

const ROTULO_STATUS = {
  invited: 'Convite pendente',
  active: 'Ativo',
  inactive: 'Desativado',
} as const

export default async function PessoasPage() {
  const [people, areas] = await Promise.all([listPeople(), listAreas()])

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_340px]">
      <section>
        <h1 className="mb-4 text-xl font-semibold">Pessoas</h1>
        <ul className="divide-y divide-borda rounded-card border border-borda bg-superficie">
          {people.map((person) => (
            <PersonRowItem
              key={person.id}
              person={person}
              areas={areas}
              statusLabel={ROTULO_STATUS[person.status]}
            />
          ))}
        </ul>
      </section>

      <aside>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-texto-suave">
          Convidar pessoa
        </h2>
        <InviteForm areas={areas} />
      </aside>
    </div>
  )
}
```

Crie `src/app/(admin)/admin/pessoas/invite-form.tsx`:

```typescript
'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import type { AreaRow } from '@/server/areas'
import { invitePerson } from '@/server/people'

export function InviteForm({ areas }: { areas: AreaRow[] }) {
  const [state, action, pending] = useActionState(invitePerson, null)

  return (
    <form action={action} className="flex flex-col gap-4 rounded-card border border-borda bg-superficie p-4">
      <Field label="Nome completo" htmlFor="fullName">
        <Input id="fullName" name="fullName" required minLength={3} maxLength={120} />
      </Field>
      <Field label="E-mail" htmlFor="email">
        <Input id="email" name="email" type="email" required />
      </Field>
      <Field label="Papel" htmlFor="role">
        <select
          id="role"
          name="role"
          defaultValue="member"
          className="w-full rounded-lg border border-borda bg-superficie px-3 py-2 text-sm"
        >
          <option value="member">Colaborador</option>
          <option value="leader">Líder de setor</option>
          <option value="admin">Administrador</option>
        </select>
      </Field>
      <Field label="Área" htmlFor="areaId" hint="Obrigatória para colaborador e líder">
        <select
          id="areaId"
          name="areaId"
          className="w-full rounded-lg border border-borda bg-superficie px-3 py-2 text-sm"
        >
          <option value="">Sem área</option>
          {areas.map((area) => (
            <option key={area.id} value={area.id}>
              {area.name}
            </option>
          ))}
        </select>
      </Field>

      {state && !state.ok && (
        <p role="alert" className="text-xs text-perigo">
          {state.error}
        </p>
      )}
      {state?.ok && <p className="text-xs text-sucesso">Convite enviado.</p>}

      <Button type="submit" disabled={pending}>
        {pending ? 'Enviando…' : 'Enviar convite'}
      </Button>
    </form>
  )
}
```

Crie `src/app/(admin)/admin/pessoas/person-row.tsx`:

```typescript
'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import type { AreaRow } from '@/server/areas'
import { setPersonStatus, updatePerson, type PersonRow } from '@/server/people'

const ROTULO_PAPEL = { admin: 'Administrador', leader: 'Líder', member: 'Colaborador' } as const

export function PersonRowItem({
  person,
  areas,
  statusLabel,
}: {
  person: PersonRow
  areas: AreaRow[]
  statusLabel: string
}) {
  const [updateState, updateAction, updating] = useActionState(updatePerson, null)
  const [statusState, statusAction, changingStatus] = useActionState(setPersonStatus, null)
  const erro = (!updateState?.ok && updateState?.error) || (!statusState?.ok && statusState?.error)

  return (
    <li className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center">
      <div className="flex-1">
        <p className="text-sm font-medium">{person.fullName}</p>
        <p className="text-xs text-texto-suave">
          {person.email} · {ROTULO_PAPEL[person.role]}
          {person.areaName ? ` · ${person.areaName}` : ''} · {statusLabel}
        </p>
        {erro && (
          <p role="alert" className="mt-1 text-xs text-perigo">
            {erro}
          </p>
        )}
      </div>

      <form action={updateAction} className="flex items-center gap-2">
        <input type="hidden" name="id" value={person.id} />
        <select
          name="role"
          defaultValue={person.role}
          className="rounded-lg border border-borda bg-superficie px-2 py-1 text-xs"
          aria-label={`Papel de ${person.fullName}`}
        >
          <option value="member">Colaborador</option>
          <option value="leader">Líder</option>
          <option value="admin">Administrador</option>
        </select>
        <select
          name="areaId"
          defaultValue={person.areaId ?? ''}
          className="rounded-lg border border-borda bg-superficie px-2 py-1 text-xs"
          aria-label={`Área de ${person.fullName}`}
        >
          <option value="">Sem área</option>
          {areas.map((area) => (
            <option key={area.id} value={area.id}>
              {area.name}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secundario" disabled={updating} className="px-3 py-1 text-xs">
          Salvar
        </Button>
      </form>

      <form action={statusAction}>
        <input type="hidden" name="id" value={person.id} />
        <input type="hidden" name="status" value={person.status === 'inactive' ? 'active' : 'inactive'} />
        <Button
          type="submit"
          variant={person.status === 'inactive' ? 'secundario' : 'perigo'}
          disabled={changingStatus}
          className="px-3 py-1 text-xs"
        >
          {person.status === 'inactive' ? 'Reativar' : 'Desativar'}
        </Button>
      </form>
    </li>
  )
}
```

- [ ] **Step 3: Escrever o teste de integração do convite**

Crie `tests/db/people.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { adminClient, createTestUser } from './client'

const db = adminClient()

describe('perfis', () => {
  it('cria perfil de colaborador com status ativo e área', async () => {
    const stamp = Date.now()
    const { data: area } = await db
      .from('areas')
      .insert({ name: 'Copy', slug: `copy-${stamp}` })
      .select('id')
      .single()

    const id = await createTestUser({
      email: `copy-${stamp}@gexcorp.com.br`,
      fullName: 'Redator',
      role: 'member',
      areaId: area!.id,
    })

    const { data } = await db
      .from('profiles')
      .select('role, status, area_id')
      .eq('id', id)
      .single()

    expect(data).toMatchObject({ role: 'member', status: 'active', area_id: area!.id })
  })

  it('apaga o perfil junto com o usuário do auth', async () => {
    const stamp = Date.now()
    const id = await createTestUser({
      email: `temporario-${stamp}@gexcorp.com.br`,
      fullName: 'Temporário',
      role: 'member',
    })

    await db.auth.admin.deleteUser(id)

    const { data } = await db.from('profiles').select('id').eq('id', id).maybeSingle()
    expect(data).toBeNull()
  })

  it('zera a área do perfil quando a área é apagada', async () => {
    const stamp = Date.now()
    const { data: area } = await db
      .from('areas')
      .insert({ name: 'Efêmera', slug: `efemera-${stamp}` })
      .select('id')
      .single()

    const id = await createTestUser({
      email: `orfao-${stamp}@gexcorp.com.br`,
      fullName: 'Órfão',
      role: 'member',
      areaId: area!.id,
    })

    await db.from('areas').delete().eq('id', area!.id)

    const { data } = await db.from('profiles').select('area_id').eq('id', id).single()
    expect(data!.area_id).toBeNull()
  })
})
```

- [ ] **Step 4: Rodar tudo**

Run: `npm test && npm run test:db && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(admin): convite de pessoas com papel e area, com guardas contra autossabotagem"
```

---

### Task 8: Telas de autenticação e o fluxo de primeiro acesso

**Files:**
- Create: `src/app/(auth)/layout.tsx`
- Create: `src/app/(auth)/login/page.tsx`
- Create: `src/app/(auth)/login/login-form.tsx`
- Create: `src/app/(auth)/convite/page.tsx`
- Create: `src/app/(auth)/recuperar-senha/page.tsx`
- Create: `src/app/(auth)/nova-senha/page.tsx`
- Create: `src/app/(auth)/definir-senha-form.tsx`
- Create: `src/app/auth/confirm/route.ts`
- Create: `src/app/(app)/layout.tsx`
- Create: `src/app/(app)/page.tsx`
- Create: `src/app/(app)/perfil/page.tsx`
- Create: `src/app/(app)/perfil/profile-form.tsx`
- Create: `src/app/not-found.tsx`
- Create: `src/server/account.ts`
- Create: `e2e/primeiro-acesso.spec.ts`
- Create: `e2e/helpers.ts`
- Delete: `src/app/page.tsx` (a home gerada pelo `create-next-app`)

**Interfaces:**
- Consumes: `createBrowserSupabase`, `createAdminSupabase`, `getCurrentUser`, `AppShell`.
- Produces:
  - `activateAccount(): Promise<ActionResult<null>>` em `src/server/account.ts` — marca `status = 'active'` após a senha ser definida.
  - `updateProfile(_prev, formData): Promise<ActionResult<null>>` em `src/server/account.ts` — nome e foto do próprio perfil.
  - Rota `GET /auth/confirm` que troca o token do e-mail por sessão.
  - Helper de teste `criarUsuarioDeTeste()` em `e2e/helpers.ts`.

- [ ] **Step 1: Criar a rota de confirmação de token**

Crie `src/app/auth/confirm/route.ts`:

```typescript
import { redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * Recebe o link do e-mail (convite ou recuperação de senha), troca o token por
 * uma sessão e leva a pessoa para a tela de definir senha.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? '/convite'

  if (!token_hash || !type) redirect('/login?erro=link-invalido')

  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.verifyOtp({ type, token_hash })

  if (error) redirect('/login?erro=link-expirado')
  redirect(next)
}
```

- [ ] **Step 2: Criar a action que ativa a conta**

Crie `src/server/account.ts`:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabase } from '@/lib/supabase/server'
import { ok, toActionError, type ActionResult } from './result'

/**
 * Marca o perfil como ativo depois que a pessoa define a senha pelo convite.
 * Roda com a sessão da própria pessoa e só altera o próprio registro.
 */
export async function activateAccount(): Promise<ActionResult<null>> {
  try {
    const supabase = await createServerSupabase()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Sessão expirada. Abra o link do convite novamente.' }

    const { error } = await supabase
      .from('profiles')
      .update({ status: 'active' })
      .eq('id', user.id)
      .eq('status', 'invited')

    if (error) throw error

    revalidatePath('/', 'layout')
    return ok(null)
  } catch (error) {
    return toActionError(error)
  }
}
```

O filtro `.eq('status', 'invited')` impede que a rota reative alguém que o admin desativou.

- [ ] **Step 3: Criar o layout e a tela de login**

Crie `src/app/(auth)/layout.tsx`:

```typescript
import type { ReactNode } from 'react'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center text-xl font-semibold text-marca-600">GEX Academy</h1>
        <div className="rounded-card border border-borda bg-superficie p-6">{children}</div>
      </div>
    </div>
  )
}
```

Crie `src/app/(auth)/login/page.tsx`:

```typescript
import Link from 'next/link'
import { LoginForm } from './login-form'

export const metadata = { title: 'Entrar — GEX Academy' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; erro?: string }>
}) {
  const { redirect, erro } = await searchParams

  const MENSAGENS: Record<string, string> = {
    'link-invalido': 'O link do e-mail está incompleto. Peça um novo convite.',
    'link-expirado': 'O link expirou. Peça um novo convite ao administrador.',
  }

  return (
    <>
      {erro && MENSAGENS[erro] && (
        <p role="alert" className="mb-4 rounded-lg bg-perigo/10 p-3 text-xs text-perigo">
          {MENSAGENS[erro]}
        </p>
      )}
      <LoginForm redirectTo={redirect ?? '/'} />
      <p className="mt-4 text-center text-xs text-texto-suave">
        <Link href="/recuperar-senha" className="underline">
          Esqueci minha senha
        </Link>
      </p>
    </>
  )
}
```

Crie `src/app/(auth)/login/login-form.tsx`:

```typescript
'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { createBrowserSupabase } from '@/lib/supabase/client'

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter()
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErro(null)
    setEnviando(true)

    const form = new FormData(event.currentTarget)
    const supabase = createBrowserSupabase()
    const { error } = await supabase.auth.signInWithPassword({
      email: String(form.get('email')).trim().toLowerCase(),
      password: String(form.get('password')),
    })

    if (error) {
      setErro('E-mail ou senha incorretos.')
      setEnviando(false)
      return
    }

    router.replace(redirectTo)
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="E-mail" htmlFor="email">
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </Field>
      <Field label="Senha" htmlFor="password" error={erro ?? undefined}>
        <Input id="password" name="password" type="password" required autoComplete="current-password" />
      </Field>
      <Button type="submit" disabled={enviando}>
        {enviando ? 'Entrando…' : 'Entrar'}
      </Button>
    </form>
  )
}
```

- [ ] **Step 4: Criar as telas de definir e recuperar senha**

Crie `src/app/(auth)/definir-senha-form.tsx`:

```typescript
'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { createBrowserSupabase } from '@/lib/supabase/client'
import { activateAccount } from '@/server/account'

export function DefinirSenhaForm({ ativarConta }: { ativarConta: boolean }) {
  const router = useRouter()
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErro(null)

    const form = new FormData(event.currentTarget)
    const senha = String(form.get('password'))
    const confirmacao = String(form.get('confirm'))

    if (senha.length < 8) {
      setErro('A senha precisa de ao menos 8 caracteres.')
      return
    }
    if (senha !== confirmacao) {
      setErro('As senhas não conferem.')
      return
    }

    setEnviando(true)
    const supabase = createBrowserSupabase()
    const { error } = await supabase.auth.updateUser({ password: senha })

    if (error) {
      setErro('Não foi possível salvar a senha. Abra o link do e-mail novamente.')
      setEnviando(false)
      return
    }

    if (ativarConta) await activateAccount()

    router.replace('/')
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="Nova senha" htmlFor="password" hint="Ao menos 8 caracteres">
        <Input id="password" name="password" type="password" required autoComplete="new-password" />
      </Field>
      <Field label="Repita a senha" htmlFor="confirm" error={erro ?? undefined}>
        <Input id="confirm" name="confirm" type="password" required autoComplete="new-password" />
      </Field>
      <Button type="submit" disabled={enviando}>
        {enviando ? 'Salvando…' : 'Salvar senha'}
      </Button>
    </form>
  )
}
```

Crie `src/app/(auth)/convite/page.tsx`:

```typescript
import { DefinirSenhaForm } from '../definir-senha-form'

export const metadata = { title: 'Bem-vindo — GEX Academy' }

export default function ConvitePage() {
  return (
    <>
      <p className="mb-4 text-sm text-texto-suave">
        Bem-vindo à GEX Academy. Defina sua senha para entrar.
      </p>
      <DefinirSenhaForm ativarConta />
    </>
  )
}
```

Crie `src/app/(auth)/nova-senha/page.tsx`:

```typescript
import { DefinirSenhaForm } from '../definir-senha-form'

export const metadata = { title: 'Nova senha — GEX Academy' }

export default function NovaSenhaPage() {
  return (
    <>
      <p className="mb-4 text-sm text-texto-suave">Escolha uma nova senha.</p>
      <DefinirSenhaForm ativarConta={false} />
    </>
  )
}
```

Crie `src/app/(auth)/recuperar-senha/page.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { createBrowserSupabase } from '@/lib/supabase/client'

export default function RecuperarSenhaPage() {
  const [enviado, setEnviado] = useState(false)
  const [enviando, setEnviando] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setEnviando(true)

    const form = new FormData(event.currentTarget)
    const supabase = createBrowserSupabase()
    await supabase.auth.resetPasswordForEmail(String(form.get('email')).trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/auth/confirm?next=/nova-senha`,
    })

    // Sempre confirma o envio: dizer que o e-mail não existe revela quem
    // trabalha na empresa para quem estiver testando endereços.
    setEnviado(true)
    setEnviando(false)
  }

  if (enviado) {
    return (
      <p className="text-sm text-texto-suave">
        Se houver uma conta com esse e-mail, o link de recuperação já está a caminho.
      </p>
    )
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="E-mail" htmlFor="email">
        <Input id="email" name="email" type="email" required />
      </Field>
      <Button type="submit" disabled={enviando}>
        {enviando ? 'Enviando…' : 'Enviar link'}
      </Button>
    </form>
  )
}
```

- [ ] **Step 5: Criar o layout e a home do colaborador**

Remova a home gerada pelo template e crie a nossa:

```bash
rm src/app/page.tsx
```

Crie `src/app/(app)/layout.tsx`:

```typescript
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { AppShell } from '@/components/layout/app-shell'
import { getCurrentUser } from '@/lib/auth/session'

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  if (user.status === 'invited') redirect('/convite')
  if (user.status === 'inactive') {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <p className="max-w-sm text-center text-sm text-texto-suave">
          Seu acesso à GEX Academy está desativado. Fale com o administrador.
        </p>
      </div>
    )
  }

  return <AppShell user={user}>{children}</AppShell>
}
```

Crie `src/app/(app)/page.tsx`:

```typescript
import { getCurrentUser } from '@/lib/auth/session'

export const metadata = { title: 'Início — GEX Academy' }

export default async function HomePage() {
  const user = await getCurrentUser()

  return (
    <div>
      <h1 className="text-xl font-semibold">Olá, {user!.fullName.split(' ')[0]}</h1>
      <p className="mt-2 text-sm text-texto-suave">
        A vitrine de cursos aparece aqui na fase 2.
      </p>
    </div>
  )
}
```

- [ ] **Step 6: Criar a tela de perfil e a página de 404**

A navegação criada na Task 5 aponta para `/perfil` para todos os papéis; sem esta
tela o link quebra.

Acrescente ao final de `src/server/account.ts`:

```typescript
import { z } from 'zod'

const perfilSchema = z.object({
  fullName: z.string().trim().min(3, 'Informe o nome completo.').max(120),
  avatarUrl: z.string().trim().url('A foto precisa ser uma URL válida.').optional().or(z.literal('')),
})

/** Atualiza nome e foto do próprio perfil. Ninguém edita o perfil alheio por aqui. */
export async function updateProfile(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const supabase = await createServerSupabase()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Faça login para continuar.' }

    const parsed = perfilSchema.safeParse(Object.fromEntries(formData))
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: parsed.data.fullName,
        avatar_url: parsed.data.avatarUrl || null,
      })
      .eq('id', user.id)

    if (error) throw error

    revalidatePath('/perfil')
    revalidatePath('/', 'layout')
    return ok(null)
  } catch (error) {
    return toActionError(error)
  }
}
```

A política `profiles_admin_escreve` da migration 0001 permite `update` apenas a
admins, então acrescente uma migration para o caso do próprio perfil.
Crie `supabase/migrations/0002_perfil_proprio.sql`:

```sql
-- A pessoa edita o próprio nome e a própria foto.
-- Papel, área e status ficam de fora: quem muda isso é o admin.
create policy profiles_edita_o_proprio on public.profiles
  for update to authenticated
  using (id = auth.uid() and public.auth_is_active())
  with check (
    id = auth.uid()
    and role = public.auth_profile_role()
    and status = 'active'
    and area_id is not distinct from public.auth_profile_area()
  );
```

Crie `src/app/(app)/perfil/profile-form.tsx`:

```typescript
'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { createBrowserSupabase } from '@/lib/supabase/client'
import { updateProfile } from '@/server/account'

export function ProfileForm({
  fullName,
  avatarUrl,
}: {
  fullName: string
  avatarUrl: string | null
}) {
  const [state, action, saving] = useActionState(updateProfile, null)
  const [senhaMsg, setSenhaMsg] = useState<{ tipo: 'erro' | 'ok'; texto: string } | null>(null)
  const [trocando, setTrocando] = useState(false)

  async function trocarSenha(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSenhaMsg(null)

    const form = new FormData(event.currentTarget)
    const senha = String(form.get('password'))
    if (senha.length < 8) {
      setSenhaMsg({ tipo: 'erro', texto: 'A senha precisa de ao menos 8 caracteres.' })
      return
    }
    if (senha !== String(form.get('confirm'))) {
      setSenhaMsg({ tipo: 'erro', texto: 'As senhas não conferem.' })
      return
    }

    setTrocando(true)
    const { error } = await createBrowserSupabase().auth.updateUser({ password: senha })
    setTrocando(false)
    setSenhaMsg(
      error
        ? { tipo: 'erro', texto: 'Não foi possível trocar a senha.' }
        : { tipo: 'ok', texto: 'Senha atualizada.' },
    )
    event.currentTarget.reset()
  }

  return (
    <div className="flex flex-col gap-8">
      <form action={action} className="flex flex-col gap-4 rounded-card border border-borda bg-superficie p-4">
        <h2 className="text-sm font-semibold">Seus dados</h2>
        <Field label="Nome completo" htmlFor="fullName">
          <Input id="fullName" name="fullName" defaultValue={fullName} required minLength={3} maxLength={120} />
        </Field>
        <Field label="URL da foto" htmlFor="avatarUrl" hint="Opcional">
          <Input id="avatarUrl" name="avatarUrl" type="url" defaultValue={avatarUrl ?? ''} />
        </Field>
        {state && !state.ok && (
          <p role="alert" className="text-xs text-perigo">
            {state.error}
          </p>
        )}
        {state?.ok && <p className="text-xs text-sucesso">Perfil salvo.</p>}
        <Button type="submit" disabled={saving} className="self-start">
          {saving ? 'Salvando…' : 'Salvar'}
        </Button>
      </form>

      <form onSubmit={trocarSenha} className="flex flex-col gap-4 rounded-card border border-borda bg-superficie p-4">
        <h2 className="text-sm font-semibold">Trocar senha</h2>
        <Field label="Nova senha" htmlFor="password" hint="Ao menos 8 caracteres">
          <Input id="password" name="password" type="password" required autoComplete="new-password" />
        </Field>
        <Field
          label="Repita a senha"
          htmlFor="confirm"
          error={senhaMsg?.tipo === 'erro' ? senhaMsg.texto : undefined}
        >
          <Input id="confirm" name="confirm" type="password" required autoComplete="new-password" />
        </Field>
        {senhaMsg?.tipo === 'ok' && <p className="text-xs text-sucesso">{senhaMsg.texto}</p>}
        <Button type="submit" variant="secundario" disabled={trocando} className="self-start">
          {trocando ? 'Trocando…' : 'Trocar senha'}
        </Button>
      </form>
    </div>
  )
}
```

Crie `src/app/(app)/perfil/page.tsx`:

```typescript
import { getCurrentUser } from '@/lib/auth/session'
import { ProfileForm } from './profile-form'

export const metadata = { title: 'Perfil — GEX Academy' }

const ROTULO_PAPEL = { admin: 'Administrador', leader: 'Líder de setor', member: 'Colaborador' } as const

export default async function PerfilPage() {
  const user = await getCurrentUser()

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-xl font-semibold">Perfil</h1>
      <p className="mb-6 mt-1 text-sm text-texto-suave">
        {user!.email} · {ROTULO_PAPEL[user!.role]}
      </p>
      <ProfileForm fullName={user!.fullName} avatarUrl={user!.avatarUrl} />
    </div>
  )
}
```

Crie `src/app/not-found.tsx`:

```typescript
import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-lg font-semibold">Página não encontrada</h1>
      <p className="max-w-sm text-sm text-texto-suave">
        O endereço não existe, ou o conteúdo não está disponível para você.
      </p>
      <Link href="/" className="text-sm text-marca-600 hover:underline">
        Voltar ao início
      </Link>
    </div>
  )
}
```

Aplique a migration:

```bash
npm run db:push
```

- [ ] **Step 7: Escrever o teste E2E do primeiro acesso**

Crie `e2e/helpers.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local' })

export function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

/**
 * Cria uma pessoa já com senha, pulando o e-mail de convite.
 * O fluxo do link por e-mail é verificado à parte, no Inbucket local.
 */
export async function criarUsuarioDeTeste(input: {
  email: string
  senha: string
  fullName: string
  role: 'admin' | 'leader' | 'member'
  areaId?: string | null
  status?: 'invited' | 'active' | 'inactive'
}) {
  const db = adminClient()
  const { data, error } = await db.auth.admin.createUser({
    email: input.email,
    password: input.senha,
    email_confirm: true,
  })
  if (error || !data.user) throw error ?? new Error('usuário não criado')

  await db.from('profiles').insert({
    id: data.user.id,
    full_name: input.fullName,
    email: input.email,
    role: input.role,
    area_id: input.areaId ?? null,
    status: input.status ?? 'active',
  })

  return data.user.id
}

export async function criarAreaDeTeste(nome: string) {
  const db = adminClient()
  const { data, error } = await db
    .from('areas')
    .insert({ name: nome, slug: `${nome.toLowerCase()}-${Date.now()}` })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}
```

Crie `e2e/primeiro-acesso.spec.ts`:

```typescript
import { expect, test } from '@playwright/test'
import { adminClient, criarAreaDeTeste, criarUsuarioDeTeste } from './helpers'

test('colaborador ativo entra e vê a navegação de colaborador', async ({ page }) => {
  const stamp = Date.now()
  const email = `colab-${stamp}@gexcorp.com.br`
  const areaId = await criarAreaDeTeste('Copy')
  await criarUsuarioDeTeste({
    email,
    senha: 'senha-de-teste-123',
    fullName: 'Ana Colaboradora',
    role: 'member',
    areaId,
  })

  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill('senha-de-teste-123')
  await page.getByRole('button', { name: 'Entrar' }).click()

  await expect(page.getByRole('heading', { name: 'Olá, Ana' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Início' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Pessoas' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Gerenciar' })).toHaveCount(0)
})

test('colaborador abre o próprio perfil e salva o nome', async ({ page }) => {
  const stamp = Date.now()
  const email = `perfil-${stamp}@gexcorp.com.br`
  const areaId = await criarAreaDeTeste('Infraa')
  await criarUsuarioDeTeste({
    email,
    senha: 'senha-de-teste-123',
    fullName: 'Fabio Original',
    role: 'member',
    areaId,
  })

  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill('senha-de-teste-123')
  await page.getByRole('button', { name: 'Entrar' }).click()

  await page.getByRole('link', { name: 'Perfil' }).click()
  await expect(page.getByRole('heading', { name: 'Perfil' })).toBeVisible()

  await page.getByLabel('Nome completo').fill('Fabio Atualizado')
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('Perfil salvo.')).toBeVisible()

  const { data } = await adminClient().from('profiles').select('full_name').eq('email', email).single()
  expect(data!.full_name).toBe('Fabio Atualizado')
})

test('visitante sem sessão é levado ao login', async ({ page }) => {
  await page.goto('/admin/pessoas')
  await expect(page).toHaveURL(/\/login/)
})

test('colaborador comum não abre a área do admin', async ({ page }) => {
  const stamp = Date.now()
  const email = `intruso-${stamp}@gexcorp.com.br`
  const areaId = await criarAreaDeTeste('Design')
  await criarUsuarioDeTeste({
    email,
    senha: 'senha-de-teste-123',
    fullName: 'Bruno Intruso',
    role: 'member',
    areaId,
  })

  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill('senha-de-teste-123')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('heading', { name: 'Olá, Bruno' })).toBeVisible()

  await page.goto('/admin/pessoas')
  await expect(page).toHaveURL('/')
})

test('pessoa desativada vê o aviso e não acessa o conteúdo', async ({ page }) => {
  const stamp = Date.now()
  const email = `desativado-${stamp}@gexcorp.com.br`
  await criarUsuarioDeTeste({
    email,
    senha: 'senha-de-teste-123',
    fullName: 'Carla Desativada',
    role: 'member',
    status: 'inactive',
  })

  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill('senha-de-teste-123')
  await page.getByRole('button', { name: 'Entrar' }).click()

  await expect(page.getByText('Seu acesso à GEX Academy está desativado.')).toBeVisible()
})

test('admin convida pessoa e ela aparece na lista como convite pendente', async ({ page }) => {
  const stamp = Date.now()
  const emailAdmin = `admin-${stamp}@gexcorp.com.br`
  const emailConvidado = `convidado-${stamp}@gexcorp.com.br`
  await criarUsuarioDeTeste({
    email: emailAdmin,
    senha: 'senha-de-teste-123',
    fullName: 'Diego Admin',
    role: 'admin',
  })
  await criarAreaDeTeste('Infra')

  await page.goto('/login')
  await page.getByLabel('E-mail').fill(emailAdmin)
  await page.getByLabel('Senha').fill('senha-de-teste-123')
  await page.getByRole('button', { name: 'Entrar' }).click()

  await page.goto('/admin/pessoas')
  await page.getByLabel('Nome completo').fill('Eva Convidada')
  await page.getByLabel('E-mail').fill(emailConvidado)
  await page.getByLabel('Papel').selectOption('member')
  await page.getByLabel('Área').selectOption({ index: 1 })
  await page.getByRole('button', { name: 'Enviar convite' }).click()

  await expect(page.getByText('Convite enviado.')).toBeVisible()
  await expect(page.getByText(emailConvidado)).toBeVisible()
  await expect(page.getByText('Convite pendente')).toBeVisible()

  // Confirma no banco que o perfil nasceu com status 'invited'.
  const { data } = await adminClient()
    .from('profiles')
    .select('status, role')
    .eq('email', emailConvidado)
    .single()
  expect(data).toMatchObject({ status: 'invited', role: 'member' })
})
```

- [ ] **Step 8: Rodar a suíte completa**

```bash
npm run db:reset
npm test
npm run test:db
npm run build
npm run test:e2e
```

Expected: PASS em todas as etapas. Os testes E2E falam com o projeto Supabase de desenvolvimento, então `.env.local` precisa estar preenchido.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(auth): login, convite, perfil e recuperacao com E2E de primeiro acesso"
```

---

## Encerramento da Fase 1

Ao final desta fase, a plataforma tem: banco completo com RLS ligado, a regra de acesso isolada e testada, sessão funcionando, admin criando áreas e convidando pessoas, e cada papel vendo a navegação certa. A fase 2 acrescenta o conteúdo — cursos, aulas, vídeo, anexos e a vitrine com cadeado.
