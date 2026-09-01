# GEX Academy — Fase 4: vitrine por área e identidade visual

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a home de "lista de todos os cursos" para "vitrine por área", com página própria por área, e aplicar a identidade visual da GEX com tema escuro e claro.

**Architecture:** A vitrine é derivada — `getCatalog()` já devolve todo curso publicado com `access` calculado por curso, então agrupar por área e decidir o estado de bloqueio é função pura, sem consulta nova e sem regra de acesso nova. O tema é troca de valores de token em `globals.css`: nenhum componente cita cor literal, então as telas de gestão, admin e fórum acompanham sem serem tocadas.

**Tech Stack:** Next.js 16 (App Router), Tailwind CSS v4, Supabase (Postgres + RLS), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-01-gex-academy-vitrine-design.md`

## Global Constraints

- Next.js **16**: middleware é `src/proxy.ts` exportando `proxy`. Antes de escrever código de framework, leia o guia em `node_modules/next/dist/docs/` — esta versão tem mudanças em relação ao que você lembra.
- `@supabase/ssr` com `getAll`/`setAll` apenas.
- `SUPABASE_SERVICE_ROLE_KEY` e `RESEND_API_KEY` nunca com prefixo `NEXT_PUBLIC_`.
- Nenhum componente de tela chama o Supabase direto — tudo por `src/server/`.
- Um módulo `'use server'` só exporta funções `async`. Lógica pura vai no irmão `*-query.ts`.
- Toda server action valida com Zod, verifica papel **e** verifica acesso ao recurso específico. Devolve `ActionResult<T>`.
- RLS habilitado em todas as tabelas. **Esta fase não altera nenhuma regra de acesso.**
- **Nenhum componente ganha cor literal nem variante `dark:`.** Cor sai de token; se muda no escuro, quem muda é o token.
- Interface em pt-BR, fuso `America/Sao_Paulo`. TypeScript `strict`, sem `any`.
- Cores da marca: `#004EAC` (azul), `#01CDFF` (ciano), `#221F20` (preto).
- Capas: área **1600 × 1000 px**, curso **1280 × 800 px**, ambas 16:10.

## Restrições de ambiente — leia antes de rodar qualquer comando

O projeto aponta para o Supabase **real** da GEX Academy, que tem a conta de admin do dono do produto e a área real "Infra - FunnelOps".

- **NUNCA** `npm run db:reset` — apaga e recria o banco. Use `npm run db:push`, que é aditivo.
- **NUNCA** `npm run test:e2e` inteiro — `e2e/primeiro-acesso.spec.ts` dispara convite de e-mail real contra cota esgotada. Rode specs por caminho: `npx playwright test e2e/<arquivo>.spec.ts`.
- **NUNCA** `npm run db:types` — precisa de runtime de contêiner indisponível. `src/lib/supabase/database.types.ts` é mantido à mão.
- Só o projeto Supabase "Gex Academy" pode ser tocado.
- Use `criarLixeira` de `tests/db/client.ts` em qualquer fixture de banco, e confirme com `node scripts/limpar-dados-de-teste.mjs` (dry-run por padrão) que não sobrou nada. A linha de base é zero.

## Estrutura de arquivos

**Criar:**

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/0011_capa_de_area.sql` | Coluna `areas.cover_url` |
| `src/lib/tema/tema.ts` | Função pura que decide o tema inicial |
| `src/lib/tema/tema.test.ts` | Teste da função acima |
| `src/components/layout/theme-toggle.tsx` | Botão de alternar tema (cliente) |
| `src/components/layout/gex-logo.tsx` | A logo em SVG, tingida por `currentColor` |
| `src/components/ui/cover-field.tsx` | Campo de capa com retângulo declarando a medida |
| `src/server/vitrine-query.ts` | Lógica pura: monta as áreas da vitrine a partir do catálogo |
| `src/server/vitrine-query.test.ts` | Teste da lógica acima |
| `src/app/(app)/area/[slug]/page.tsx` | Página de uma área |
| `src/components/catalog/area-card.tsx` | Capa de área na grade |
| `src/components/catalog/hero-banner.tsx` | Banner do topo da home |
| `src/app/(admin)/admin/areas/area-row.tsx` | Linha de área com edição inline |
| `e2e/vitrine.spec.ts` | E2E do fluxo home → área → curso |

**Modificar:**

| Arquivo | Mudança |
|---|---|
| `src/app/globals.css` | Paleta da marca em tokens; bloco `:root.dark` |
| `src/app/layout.tsx` | Script de tema antes da primeira pintura |
| `src/components/layout/app-shell.tsx` | Logo no lugar do texto; botão de tema |
| `src/app/(app)/page.tsx` | Reescrita: banner + grade de áreas |
| `src/server/catalog-query.ts` | `areaSlug`/`areaCoverUrl` no item e no grupo |
| `src/server/catalog-query.test.ts` | Campos novos nas fixtures |
| `src/server/areas.ts` | `coverUrl` no schema, insert, update e `AreaRow` |
| `src/app/(admin)/admin/areas/area-form.tsx` | Campo de capa |
| `src/app/(admin)/admin/areas/page.tsx` | Usa `AreaRow` com edição |
| `src/app/(manage)/gerenciar/cursos/[id]/course-settings.tsx` | Campo de capa com medida |
| `src/lib/supabase/database.types.ts` | Coluna `cover_url` em `areas` (à mão) |

---

### Task 1: Identidade visual e tema escuro/claro

**Files:**
- Create: `src/lib/tema/tema.ts`
- Create: `src/lib/tema/tema.test.ts`
- Create: `src/components/layout/theme-toggle.tsx`
- Create: `src/components/layout/gex-logo.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`
- Modify: `src/components/layout/app-shell.tsx`

**Interfaces:**
- Consumes: nada de tarefas anteriores.
- Produces:
  - `type Tema = 'dark' | 'light'`
  - `const CHAVE_TEMA = 'gex-tema'`
  - `function temaInicial(armazenado: string | null): Tema`
  - `<GexLogo className?: string />` — SVG que herda `currentColor`
  - `<ThemeToggle />` — componente de cliente, sem props

- [ ] **Step 1: Escrever o teste da decisão de tema**

Crie `src/lib/tema/tema.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { temaInicial } from './tema'

describe('temaInicial', () => {
  it('sem preferência salva, abre no escuro — é o padrão da plataforma', () => {
    expect(temaInicial(null)).toBe('dark')
  })

  it('respeita a escolha salva pela pessoa', () => {
    expect(temaInicial('light')).toBe('light')
    expect(temaInicial('dark')).toBe('dark')
  })

  it('valor corrompido no armazenamento cai no padrão, não quebra a tela', () => {
    // localStorage é do navegador da pessoa: extensão, versão antiga do site
    // ou digitação no console podem deixar qualquer coisa ali.
    expect(temaInicial('')).toBe('dark')
    expect(temaInicial('LIGHT')).toBe('dark')
    expect(temaInicial('{"tema":"light"}')).toBe('dark')
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/lib/tema/tema.test.ts`
Expected: FAIL — `Failed to resolve import "./tema"`.

- [ ] **Step 3: Implementar a decisão de tema**

Crie `src/lib/tema/tema.ts`:

```typescript
export type Tema = 'dark' | 'light'

/** Chave única no localStorage. Usada pelo script do <head> e pelo botão. */
export const CHAVE_TEMA = 'gex-tema'

/** Escuro é o padrão da plataforma; só um valor exato e conhecido tira dele. */
export function temaInicial(armazenado: string | null): Tema {
  return armazenado === 'light' ? 'light' : 'dark'
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/lib/tema/tema.test.ts`
Expected: PASS, 3 testes.

- [ ] **Step 5: Trocar a paleta e criar o tema escuro**

Substitua o bloco `@theme` e as regras de `html`/`body` em `src/app/globals.css` por:

```css
/*
 * Identidade visual da GEX Academy.
 * Cores oficiais da marca: #004EAC (azul), #01CDFF (ciano), #221F20 (preto).
 *
 * O bloco @theme abaixo é o tema CLARO. O tema escuro (padrão da plataforma)
 * é o bloco :root.dark, que redefine os MESMOS tokens. Componente nenhum cita
 * cor literal nem usa variante `dark:` — quem muda é o token, e as telas de
 * gestão, admin e fórum acompanham sem serem tocadas.
 *
 * Sobre o ciano: #01CDFF sobre branco é ilegível (contraste ~1.6:1). Por isso
 * no tema claro a AÇÃO é o azul e o ciano só decora sobre fundo escuro (barra
 * de progresso dentro de uma capa, rótulo sobre imagem). No escuro é o
 * contrário. É deliberado, não inconsistência.
 */
@theme {
  --color-marca-50: #e6f0fb;
  --color-marca-100: #c3dcf5;
  --color-marca-500: #0060d4;
  --color-marca-600: #004eac;
  --color-marca-700: #003b83;

  --color-ciano: #01cdff;
  --color-ciano-suave: #7fe3ff;

  --color-superficie: #ffffff;
  --color-fundo: #f5f6f8;
  --color-borda: #e2e5ea;
  --color-texto: #221f20;
  --color-texto-suave: #5f5b5d;

  /* Cor da AÇÃO e o texto que vai em cima dela. Invertem entre os temas. */
  --color-acao: #004eac;
  --color-acao-texto: #ffffff;

  --color-perigo: #c02626;
  --color-sucesso: #1f8a4c;
  --color-aviso: #a86b00;

  --radius-card: 0.75rem;
}

/*
 * `:root.dark` (0,2,0) vence `:root` (0,1,0) sem depender da ordem em que o
 * Tailwind emite o @theme — que muda entre versões.
 */
:root.dark {
  --color-marca-50: #0b2036;
  --color-marca-100: #12324f;
  --color-marca-500: #3f9fe8;
  --color-marca-600: #01cdff;
  --color-marca-700: #7fe3ff;

  --color-superficie: #221f20;
  --color-fundo: #131213;
  --color-borda: #353133;
  --color-texto: #f4f3f4;
  --color-texto-suave: #a09da0;

  --color-acao: #01cdff;
  --color-acao-texto: #221f20;

  --color-perigo: #ff6b6b;
  --color-sucesso: #4ecf8b;
  --color-aviso: #e0a355;
}

html { color-scheme: light; }
:root.dark { color-scheme: dark; }

body {
  background-color: var(--color-fundo);
  color: var(--color-texto);
}
```

- [ ] **Step 6: Aplicar o tema antes da primeira pintura**

Modifique `src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { CHAVE_TEMA } from '@/lib/tema/tema'
import './globals.css'

export const metadata: Metadata = {
  title: 'GEX Academy',
  description: 'Plataforma de ensino interna da GEX.',
}

/*
 * Roda de forma síncrona antes da primeira pintura. Sem isto, quem escolheu
 * o tema claro vê um lampejo escuro a cada carregamento, porque o HTML chega
 * do servidor sem saber a preferência (ela mora no navegador da pessoa).
 * Espelha temaInicial() de src/lib/tema/tema.ts — mantenha as duas iguais.
 */
const SCRIPT_TEMA = `(function(){try{var t=localStorage.getItem('${CHAVE_TEMA}');if(t!=='light'){document.documentElement.classList.add('dark')}}catch(e){document.documentElement.classList.add('dark')}})()`

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 7: Criar o botão de tema**

Crie `src/components/layout/theme-toggle.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { CHAVE_TEMA, temaInicial, type Tema } from '@/lib/tema/tema'

export function ThemeToggle() {
  // Começa em null para o servidor e o cliente renderizarem a mesma coisa na
  // primeira passada; a preferência real só existe no navegador.
  const [tema, setTema] = useState<Tema | null>(null)

  useEffect(() => {
    setTema(temaInicial(localStorage.getItem(CHAVE_TEMA)))
  }, [])

  function alternar() {
    const novo: Tema = tema === 'light' ? 'dark' : 'light'
    setTema(novo)
    localStorage.setItem(CHAVE_TEMA, novo)
    document.documentElement.classList.toggle('dark', novo === 'dark')
  }

  const paraEscuro = tema !== 'dark'

  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={paraEscuro ? 'Usar tema escuro' : 'Usar tema claro'}
      className="rounded-card px-2 py-1 text-sm text-texto-suave hover:bg-fundo hover:text-texto focus:outline-none focus:ring-2 focus:ring-acao"
    >
      <span aria-hidden>{paraEscuro ? '☾' : '☀'}</span>
    </button>
  )
}
```

- [ ] **Step 8: Criar a logo**

Crie `src/components/layout/gex-logo.tsx`. O SVG é silhueta de cor única — `fill="currentColor"` faz uma cópia servir os dois temas. Os 24 `<path>` estão em `public/logo-gex.svg` (a logo oficial, fornecida pelo dono do produto). Copie-os para o componente **removendo o `fill="black"` de cada um** — se sobrar um só, aquela parte da logo fica preta no tema escuro e some contra o fundo:

```tsx
export function GexLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 687 418"
      fill="currentColor"
      className={className}
      role="img"
      aria-label="GEX Academy"
    >
      {/* cole aqui os <path d="..." /> do arquivo, sem os atributos fill */}
    </svg>
  )
}
```

- [ ] **Step 9: Colocar logo e botão no topo**

Em `src/components/layout/app-shell.tsx`, troque o `<Link>` de texto pela logo e acrescente o botão antes do `<SignOutButton />`:

```tsx
<Link href="/" className="text-marca-600" aria-label="Início">
  <GexLogo className="h-6 w-auto" />
</Link>
```

```tsx
<span className="text-sm text-texto-suave">{user.fullName}</span>
<ThemeToggle />
<SignOutButton />
```

Acrescente os dois imports. Não mexa em mais nada do arquivo.

- [ ] **Step 10: Rodar tudo**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: PASS.

Depois suba `npm run dev` e confirme à mão, em `/login` (que não exige sessão): a página abre escura; o `<html>` tem a classe `dark`; e nenhuma tela ficou com texto da mesma cor do fundo.

- [ ] **Step 11: Commit**

```bash
git add src/lib/tema src/components/layout src/app/globals.css src/app/layout.tsx
git commit -m "feat(visual): paleta da marca GEX, tema escuro por padrao e logo"
```

---

### Task 2: Capa de área e campos que declaram a medida

**Files:**
- Create: `supabase/migrations/0011_capa_de_area.sql`
- Create: `src/components/ui/cover-field.tsx`
- Create: `src/app/(admin)/admin/areas/area-row.tsx`
- Modify: `src/server/areas.ts`
- Modify: `src/app/(admin)/admin/areas/area-form.tsx`
- Modify: `src/app/(admin)/admin/areas/page.tsx`
- Modify: `src/app/(manage)/gerenciar/cursos/[id]/course-settings.tsx`
- Modify: `src/lib/supabase/database.types.ts`
- Test: `tests/db/areas.test.ts` (acrescentar)

**Interfaces:**
- Consumes: nada da Task 1.
- Produces:
  - `AreaRow` ganha `coverUrl: string | null`
  - `<CoverField name largura altura defaultValue? label? />`

- [ ] **Step 1: Escrever a migration**

Crie `supabase/migrations/0011_capa_de_area.sql`:

```sql
-- Capa da área, para a vitrine da fase 4.
--
-- Segue exatamente o modelo de courses.cover_url: é uma URL informada por
-- quem administra, não um upload. O projeto não tem fluxo de upload de
-- imagem, e criar um só para isto seria construir storage, política de
-- bucket e tela de envio para resolver um problema que colar uma URL já
-- resolve.
--
-- Nenhuma política nova: areas_leitura (0001) já libera leitura a qualquer
-- pessoa ativa e areas_escrita já restringe escrita a admin. A coluna herda
-- as duas.
alter table public.areas add column cover_url text;

comment on column public.areas.cover_url is
  'URL da capa da área na vitrine. 1600x1000 px, proporção 16:10. Nula cai na cor da área.';
```

- [ ] **Step 2: Aplicar a migration**

Run: `npm run db:push`
Expected: aplica a `0011` e termina sem erro. **Não** rode `db:reset`.

- [ ] **Step 3: Declarar a coluna nos tipos**

Em `src/lib/supabase/database.types.ts`, na tabela `areas`, acrescente `cover_url: string | null` em `Row`, e `cover_url?: string | null` em `Insert` e `Update`. O arquivo é mantido à mão — não rode `db:types`.

- [ ] **Step 4: Escrever o teste de banco**

Acrescente ao final de `tests/db/areas.test.ts`, dentro do arquivo já existente e usando os helpers que ele já importa:

```typescript
describe('capa da área', () => {
  it('admin grava e lê a capa; a coluna aceita nulo', async () => {
    const lixeira = criarLixeira()
    const nome = `Área Capa ${Date.now()}`

    const { data: criada, error } = await db
      .from('areas')
      .insert({ name: nome, slug: `area-capa-${Date.now()}`, cover_url: 'https://exemplo.test/capa.png' })
      .select('id, cover_url')
      .single()

    expect(error).toBeNull()
    expect(criada?.cover_url).toBe('https://exemplo.test/capa.png')
    lixeira.area(criada!.id)

    const { data: limpa } = await db
      .from('areas')
      .update({ cover_url: null })
      .eq('id', criada!.id)
      .select('cover_url')
      .single()

    expect(limpa?.cover_url).toBeNull()
    await lixeira.limpar()
  })
})
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npx vitest run --config vitest.db.config.ts tests/db/areas.test.ts`
Expected: PASS. Depois `node scripts/limpar-dados-de-teste.mjs` deve mostrar zero áreas de teste.

- [ ] **Step 6: Aceitar a capa nas ações de área**

Em `src/server/areas.ts`:

1. Acrescente `coverUrl: string | null` ao tipo `AreaRow`.
2. Acrescente ao `areaSchema`, no mesmo estilo do campo de capa de curso em `src/server/courses.ts`:

```typescript
  coverUrl: z.string().trim().url('A capa precisa ser uma URL válida.').optional().or(z.literal('')),
```

3. Nas três consultas que hoje selecionam `'id, name, slug, description, color, position'` (em `listAreas`, `createArea` e `updateArea`), acrescente `, cover_url`.
4. No `insert` de `createArea` e no `update` de `updateArea`, acrescente `cover_url: parsed.data.coverUrl || null`.
5. `listAreas` retorna linhas do banco (`cover_url`), mas `AreaRow` usa `coverUrl`. Mapeie no retorno das três funções:

```typescript
    return (data ?? []).map((linha) => ({
      id: linha.id,
      name: linha.name,
      slug: linha.slug,
      description: linha.description,
      color: linha.color,
      position: linha.position,
      coverUrl: linha.cover_url,
    }))
```

Em `createArea`/`updateArea`, que devolvem um só registro, faça o mesmo mapeamento no `ok(...)`.

- [ ] **Step 7: Criar o campo de capa com a medida**

Crie `src/components/ui/cover-field.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Field } from './field'
import { Input } from './input'

/**
 * Campo de URL de capa com um retângulo na proporção real.
 *
 * O retângulo existe por um pedido concreto do dono do produto: quem vai
 * fazer a arte precisa saber a medida ANTES de fazer, senão sobe uma imagem
 * de proporção errada e ela aparece esticada ou cortada. Vazio, o retângulo
 * declara a medida; preenchido, mostra a prévia com o MESMO corte da tela
 * real, para o problema aparecer aqui e não depois.
 */
export function CoverField({
  name,
  largura,
  altura,
  defaultValue,
  label = 'URL da capa',
}: {
  name: string
  largura: number
  altura: number
  defaultValue?: string
  label?: string
}) {
  const [url, setUrl] = useState(defaultValue ?? '')

  return (
    <Field
      label={label}
      htmlFor={name}
      hint={`${largura} × ${altura} px. Deixe o essencial no centro: em telas largas a imagem é cortada em faixa.`}
    >
      <div className="flex flex-col gap-2">
        <Input
          id={name}
          name={name}
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
        />
        <div
          className="flex items-center justify-center overflow-hidden rounded-card border border-dashed border-borda bg-fundo"
          style={{ aspectRatio: `${largura} / ${altura}` }}
        >
          {url ? (
            // Capa é URL externa informada por quem administra; next/image
            // exigiria allowlist de domínio. Mesmo mecanismo de course-card.tsx.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-xs text-texto-suave">
              {largura} × {altura} px
            </span>
          )}
        </div>
      </div>
    </Field>
  )
}
```

- [ ] **Step 8: Usar o campo nos dois formulários**

Em `src/app/(admin)/admin/areas/area-form.tsx`, acrescente antes do campo "Posição":

```tsx
<CoverField name="coverUrl" largura={1600} altura={1000} />
```

Em `src/app/(manage)/gerenciar/cursos/[id]/course-settings.tsx`, substitua o `<Field label="URL da capa" …>` inteiro (linhas 24-26) por:

```tsx
<CoverField name="coverUrl" largura={1280} altura={800} defaultValue={course.coverUrl ?? ''} />
```

Acrescente os imports e remova os de `Field`/`Input` que ficarem sem uso.

- [ ] **Step 9: Permitir editar uma área existente**

Sem isto, uma área já criada nunca recebe capa — `updateArea` existe no servidor e nenhuma tela a usa hoje. Crie `src/app/(admin)/admin/areas/area-row.tsx`:

```tsx
'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { CoverField } from '@/components/ui/cover-field'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { updateArea, type AreaRow as Area } from '@/server/areas'

export function AreaRow({ area }: { area: Area }) {
  const [aberto, setAberto] = useState(false)
  const [state, action, pending] = useActionState(updateArea, null)

  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="size-3 rounded-full border border-borda"
          style={{ backgroundColor: area.color ?? 'transparent' }}
        />
        <div className="flex-1">
          <p className="text-sm font-medium">{area.name}</p>
          <p className="text-xs text-texto-suave">
            /{area.slug}
            {!area.coverUrl && ' · sem capa'}
          </p>
        </div>
        <span className="text-xs text-texto-suave">posição {area.position}</span>
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="text-xs text-marca-600 hover:underline"
        >
          {aberto ? 'Fechar' : 'Editar'}
        </button>
      </div>

      {aberto && (
        <form action={action} className="mt-4 flex flex-col gap-4 border-t border-borda pt-4">
          <input type="hidden" name="id" value={area.id} />
          <Field label="Nome" htmlFor={`name-${area.id}`}>
            <Input id={`name-${area.id}`} name="name" required maxLength={60} defaultValue={area.name} />
          </Field>
          <Field label="Descrição" htmlFor={`description-${area.id}`}>
            <Input
              id={`description-${area.id}`}
              name="description"
              maxLength={280}
              defaultValue={area.description ?? ''}
            />
          </Field>
          <CoverField
            name="coverUrl"
            largura={1600}
            altura={1000}
            defaultValue={area.coverUrl ?? ''}
          />
          <Field label="Cor" htmlFor={`color-${area.id}`} hint="Formato #RRGGBB — usada quando não há capa">
            <Input id={`color-${area.id}`} name="color" defaultValue={area.color ?? ''} placeholder="#004EAC" />
          </Field>
          <Field label="Posição" htmlFor={`position-${area.id}`} hint="Ordem na vitrine">
            <Input
              id={`position-${area.id}`}
              name="position"
              type="number"
              min={0}
              max={999}
              defaultValue={area.position}
            />
          </Field>

          {state && !state.ok && (
            <p role="alert" className="text-xs text-perigo">
              {state.error}
            </p>
          )}
          {state?.ok && <p className="text-xs text-sucesso">Área salva.</p>}

          <Button type="submit" disabled={pending}>
            {pending ? 'Salvando…' : 'Salvar'}
          </Button>
        </form>
      )}
    </li>
  )
}
```

Em `src/app/(admin)/admin/areas/page.tsx`, troque o `<li>` inteiro do `map` por `<AreaRow key={area.id} area={area} />` e acrescente o import. O `<ul>` perde `divide-y` para `divide-y divide-borda` continuar funcionando com o formulário aberto — mantenha as classes como estão, só troque o conteúdo do `map`.

- [ ] **Step 10: Rodar tudo**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: PASS.

Depois, com `npm run dev`, abra `/admin/areas`, edite a área que já existe, cole uma URL de imagem e confirme que a prévia aparece no retângulo e que salvar funciona.

- [ ] **Step 11: Commit**

```bash
git add supabase/migrations src/server/areas.ts src/components/ui/cover-field.tsx "src/app/(admin)/admin/areas" "src/app/(manage)/gerenciar/cursos/[id]/course-settings.tsx" src/lib/supabase/database.types.ts tests/db/areas.test.ts
git commit -m "feat(areas): capa de area e campos de capa declarando a medida"
```

---

### Task 3: Os dados da vitrine

**Files:**
- Modify: `src/server/catalog-query.ts`
- Modify: `src/server/catalog-query.test.ts`
- Create: `src/server/vitrine-query.ts`
- Create: `src/server/vitrine-query.test.ts`

**Interfaces:**
- Consumes: `Catalog`, `CatalogItem` de `catalog-query.ts`.
- Produces:
  - `CatalogItem` ganha `areaSlug: string | null` e `areaCoverUrl: string | null`
  - Cada grupo de `Catalog['grupos']` ganha `areaSlug: string | null`, `areaCoverUrl: string | null`, `areaColor: string | null`
  - `type AreaVitrine = { key: string; href: string; name: string; coverUrl: string | null; color: string | null; courseCount: number; bloqueada: boolean; isOnboarding: boolean }`
  - `function montarVitrine(catalog: Catalog): AreaVitrine[]`

- [ ] **Step 1: Levar slug e capa da área até o item do catálogo**

Em `src/server/catalog-query.ts`:

1. `SELECT_CATALOGO` — troque `areas(name, color, position)` por `areas(name, slug, color, position, cover_url)`.
2. `LinhaCatalogo` — o campo `areas` vira `{ name: string; slug: string; color: string | null; position: number; cover_url: string | null } | null`.
3. `CatalogItem` — acrescente, logo abaixo de `areaName`:

```typescript
  // Slug e capa da ÁREA (não do curso). A vitrine da fase 4 monta a capa de
  // área a partir dos cursos, então precisa deles em cada item.
  areaSlug: string | null
  areaCoverUrl: string | null
```

4. `paraCatalogItem` — acrescente ao objeto devolvido:

```typescript
    areaSlug: row.areas?.slug ?? null,
    areaCoverUrl: row.areas?.cover_url ?? null,
```

5. O tipo `Grupo` dentro de `montarCatalogo` e o objeto devolvido em `.map(...)` ganham `areaSlug`, `areaCoverUrl` e `areaColor`, tirados do primeiro item do grupo (são propriedades da área, iguais em todos os itens dela):

```typescript
  type Grupo = {
    groupKey: string
    areaName: string
    areaSlug: string | null
    areaCoverUrl: string | null
    areaColor: string | null
    areaPosition: number | null
    items: CatalogItem[]
  }
```

E na criação do grupo:

```typescript
      grupo = {
        groupKey: chave,
        areaName: item.areaName ?? 'Outros',
        areaSlug: item.areaSlug,
        areaCoverUrl: item.areaCoverUrl,
        areaColor: item.areaColor,
        areaPosition: item.areaPosition,
        items: [],
      }
```

E no `.map` final, devolva também `areaSlug`, `areaCoverUrl` e `areaColor`. Atualize o tipo `Catalog['grupos']` para casar.

6. `src/server/catalog-query.test.ts` — as fixtures que constroem `LinhaCatalogo` ou `CatalogItem` à mão precisam dos campos novos. Acrescente `slug` e `cover_url` ao objeto `areas` das linhas cruas, e `areaSlug`/`areaCoverUrl` onde o teste monta um `CatalogItem` inteiro. Não mude nenhuma asserção existente.

- [ ] **Step 2: Escrever o teste da vitrine**

Crie `src/server/vitrine-query.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import type { Catalog, CatalogItem } from './catalog-query'
import { montarVitrine } from './vitrine-query'

function item(over: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id: 'c1',
    slug: 'curso-1',
    title: 'Curso 1',
    description: null,
    coverUrl: null,
    areaId: 'a1',
    areaName: 'Copy',
    areaSlug: 'copy',
    areaCoverUrl: 'https://exemplo.test/copy.png',
    areaColor: '#004EAC',
    areaPosition: 0,
    isOnboarding: false,
    lessonCount: 3,
    position: 0,
    access: 'view',
    requestStatus: 'none',
    progress: { completed: 0, total: 3, percent: 0 },
    ...over,
  }
}

function catalogo(grupos: Catalog['grupos'], onboarding: CatalogItem | null = null): Catalog {
  return { onboarding, grupos }
}

function grupo(over: Partial<Catalog['grupos'][number]> = {}): Catalog['grupos'][number] {
  return {
    groupKey: 'a1',
    areaName: 'Copy',
    areaSlug: 'copy',
    areaCoverUrl: 'https://exemplo.test/copy.png',
    areaColor: '#004EAC',
    items: [item()],
    ...over,
  }
}

describe('montarVitrine', () => {
  it('cada grupo de área vira uma capa, com contagem e destino', () => {
    const vitrine = montarVitrine(catalogo([grupo({ items: [item(), item({ id: 'c2' })] })]))

    expect(vitrine).toHaveLength(1)
    expect(vitrine[0].name).toBe('Copy')
    expect(vitrine[0].href).toBe('/area/copy')
    expect(vitrine[0].courseCount).toBe(2)
    expect(vitrine[0].coverUrl).toBe('https://exemplo.test/copy.png')
  })

  it('a contagem inclui curso bloqueado — é o número que faz a pessoa pedir acesso', () => {
    const vitrine = montarVitrine(
      catalogo([grupo({ items: [item({ access: 'view' }), item({ id: 'c2', access: 'none' })] })]),
    )

    expect(vitrine[0].courseCount).toBe(2)
  })

  it('área fica bloqueada só quando NENHUM curso dela é acessível', () => {
    const nenhum = montarVitrine(
      catalogo([grupo({ items: [item({ access: 'none' }), item({ id: 'c2', access: 'none' })] })]),
    )
    expect(nenhum[0].bloqueada).toBe(true)

    // Um único curso liberado — por área ou por liberação avulsa — destrava a capa.
    const um = montarVitrine(
      catalogo([grupo({ items: [item({ access: 'none' }), item({ id: 'c2', access: 'view' })] })]),
    )
    expect(um[0].bloqueada).toBe(false)
  })

  it('a trilha inicial vem primeiro e aponta para o curso, não para uma área', () => {
    const vitrine = montarVitrine(
      catalogo([grupo()], item({ id: 'onb', slug: 'trilha-inicial', isOnboarding: true, areaId: null, areaName: null, areaSlug: null, areaCoverUrl: null })),
    )

    expect(vitrine[0].isOnboarding).toBe(true)
    expect(vitrine[0].href).toBe('/curso/trilha-inicial')
    expect(vitrine[1].name).toBe('Copy')
  })

  it('a capa da trilha inicial é a capa do próprio curso', () => {
    const vitrine = montarVitrine(
      catalogo([], item({ isOnboarding: true, slug: 't', coverUrl: 'https://exemplo.test/onb.png', areaCoverUrl: null })),
    )

    expect(vitrine[0].coverUrl).toBe('https://exemplo.test/onb.png')
  })

  it('mantém a ordem dos grupos que o catálogo já ordenou por posição de área', () => {
    const vitrine = montarVitrine(
      catalogo([
        grupo({ groupKey: 'a1', areaName: 'Copy', areaSlug: 'copy' }),
        grupo({ groupKey: 'a2', areaName: 'Tráfego', areaSlug: 'trafego' }),
      ]),
    )

    expect(vitrine.map((a) => a.name)).toEqual(['Copy', 'Tráfego'])
  })

  it('grupo sem slug (curso órfão, o grupo "Outros") não vira capa — não teria para onde levar', () => {
    const vitrine = montarVitrine(catalogo([grupo({ areaName: 'Outros', areaSlug: null })]))

    expect(vitrine).toEqual([])
  })
})
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/server/vitrine-query.test.ts`
Expected: FAIL — `Failed to resolve import "./vitrine-query"`.

- [ ] **Step 4: Implementar a vitrine**

Crie `src/server/vitrine-query.ts`:

```typescript
// Sem 'use server': lógica pura, importável por teste. Mesmo motivo
// documentado em catalog-query.ts.
//
// A vitrine é DERIVADA do catálogo: getCatalog() já devolve todo curso
// publicado com `access` calculado por curso, incluindo os bloqueados.
// Agrupar e contar não consulta o banco e não decide acesso — a decisão de
// acesso continua sendo só a de canAccessCourse, uma por curso.
import type { Catalog } from './catalog-query'

export type AreaVitrine = {
  /** Chave estável de lista React: areaId, ou 'onboarding'. */
  key: string
  href: string
  name: string
  coverUrl: string | null
  color: string | null
  courseCount: number
  bloqueada: boolean
  isOnboarding: boolean
}

/**
 * As capas da página inicial.
 *
 * A trilha inicial vem primeiro e leva direto ao curso: ela é um curso, não
 * uma área, e não ganha página intermediária.
 *
 * Uma área fica `bloqueada` quando NENHUM curso publicado dela é acessível.
 * Basta um curso liberado — pela área da pessoa ou por liberação avulsa —
 * para a capa aparecer normal. A capa bloqueada continua clicável: a pessoa
 * entra, vê o que existe e pede acesso.
 */
export function montarVitrine(catalog: Catalog): AreaVitrine[] {
  const areas: AreaVitrine[] = []

  if (catalog.onboarding) {
    const onb = catalog.onboarding
    areas.push({
      key: 'onboarding',
      href: `/curso/${onb.slug}`,
      name: onb.title,
      coverUrl: onb.coverUrl,
      color: null,
      courseCount: onb.lessonCount,
      bloqueada: onb.access === 'none',
      isOnboarding: true,
    })
  }

  for (const grupo of catalog.grupos) {
    // O grupo "Outros" (cursos com area_id nulo que não são a trilha) não tem
    // slug e portanto não tem página de área para onde levar. Fica de fora da
    // vitrine em vez de virar uma capa que não clica.
    if (!grupo.areaSlug) continue

    areas.push({
      key: grupo.groupKey,
      href: `/area/${grupo.areaSlug}`,
      name: grupo.areaName,
      coverUrl: grupo.areaCoverUrl,
      color: grupo.areaColor,
      courseCount: grupo.items.length,
      bloqueada: grupo.items.every((item) => item.access === 'none'),
      isOnboarding: false,
    })
  }

  return areas
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/server/vitrine-query.test.ts src/server/catalog-query.test.ts`
Expected: PASS nos dois arquivos.

- [ ] **Step 6: Rodar tudo**

Run: `npm test && npm run test:db && npm run typecheck && npm run build`
Expected: PASS. O teste de banco importa que rode porque `SELECT_CATALOGO` mudou — `tests/db/catalog.test.ts` roda essa string contra o Postgres de verdade e é ele quem pega um nome de coluna errado.

- [ ] **Step 7: Commit**

```bash
git add src/server/catalog-query.ts src/server/catalog-query.test.ts src/server/vitrine-query.ts src/server/vitrine-query.test.ts
git commit -m "feat(vitrine): areas da home derivadas do catalogo, sem consulta nova"
```

---

### Task 4: A página inicial

**Files:**
- Create: `src/components/catalog/area-card.tsx`
- Create: `src/components/catalog/hero-banner.tsx`
- Modify: `src/app/(app)/page.tsx`

**Interfaces:**
- Consumes: `montarVitrine`, `AreaVitrine` de `vitrine-query.ts`; `getCatalog` de `catalog.ts`; `getContinueWatching` de `progress.ts`.
- Produces: `<AreaCard area={AreaVitrine} />`, `<HeroBanner />` (ver props no Step 2).

- [ ] **Step 1: Criar a capa de área**

Crie `src/components/catalog/area-card.tsx`:

```tsx
import Link from 'next/link'
import type { AreaVitrine } from '@/server/vitrine-query'

export function AreaCard({ area }: { area: AreaVitrine }) {
  return (
    <li>
      <Link
        href={area.href}
        className="group block overflow-hidden rounded-card focus:outline-none focus:ring-2 focus:ring-acao"
      >
        <div
          className="relative aspect-[16/10] w-full overflow-hidden rounded-card border border-borda"
          style={area.coverUrl ? undefined : { backgroundColor: area.color ?? '#353133' }}
        >
          {area.coverUrl && (
            // Capa é URL externa informada por quem administra; next/image
            // exigiria allowlist de domínio. Mesmo mecanismo de course-card.tsx.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={area.coverUrl}
              alt=""
              className={`h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03] ${
                area.bloqueada ? 'grayscale brightness-50' : ''
              }`}
            />
          )}

          {/* Gradiente que garante leitura do texto sobre qualquer imagem. */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />

          {area.bloqueada && (
            <span
              aria-hidden
              className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full bg-black/60 text-sm"
            >
              🔒
            </span>
          )}

          <div className="absolute inset-x-0 bottom-0 p-4">
            <p className="text-base font-bold leading-tight text-white">{area.name}</p>
            <p className="mt-1 text-xs text-white/75">
              {area.isOnboarding
                ? `Trilha inicial · ${area.courseCount} ${area.courseCount === 1 ? 'aula' : 'aulas'}`
                : `${area.courseCount} ${area.courseCount === 1 ? 'curso' : 'cursos'}`}
              {area.bloqueada && ' · sem acesso'}
            </p>
          </div>
        </div>
        {area.bloqueada && <span className="sr-only">Você ainda não tem acesso a esta área</span>}
      </Link>
    </li>
  )
}
```

- [ ] **Step 2: Criar o banner**

Crie `src/components/catalog/hero-banner.tsx`:

```tsx
import Link from 'next/link'

export function HeroBanner({
  rotulo,
  titulo,
  subtitulo,
  coverUrl,
  href,
  textoBotao,
}: {
  rotulo: string
  titulo: string
  subtitulo: string
  coverUrl: string | null
  href: string
  textoBotao: string
}) {
  return (
    <section
      className="relative overflow-hidden rounded-card border border-borda"
      style={coverUrl ? undefined : { backgroundColor: '#004EAC' }}
    >
      {coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}
      {/* Gradiente da esquerda para a direita: o texto fica sobre a parte escura. */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-black/20" />

      <div className="relative flex min-h-56 flex-col justify-end gap-1 p-6 sm:min-h-64 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-widest text-ciano">{rotulo}</p>
        <h1 className="max-w-xl text-2xl font-bold leading-tight text-white sm:text-3xl">{titulo}</h1>
        <p className="max-w-xl text-sm text-white/80">{subtitulo}</p>
        <Link
          href={href}
          className="mt-4 w-fit rounded-card bg-acao px-5 py-2 text-sm font-semibold text-acao-texto focus:outline-none focus:ring-2 focus:ring-acao focus:ring-offset-2"
        >
          ▶ {textoBotao}
        </Link>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Reescrever a home**

Substitua todo o conteúdo de `src/app/(app)/page.tsx` por:

```tsx
import { AreaCard } from '@/components/catalog/area-card'
import { HeroBanner } from '@/components/catalog/hero-banner'
import { getCurrentUser } from '@/lib/auth/session'
import { getCatalog } from '@/server/catalog'
import { getContinueWatching } from '@/server/progress'
import { montarVitrine } from '@/server/vitrine-query'

export const metadata = { title: 'Início — GEX Academy' }

export default async function HomePage() {
  const [user, catalog, continuar] = await Promise.all([
    getCurrentUser(),
    getCatalog(),
    getContinueWatching(),
  ])

  const areas = montarVitrine(catalog)
  const onboarding = catalog.onboarding
  const trilhaPendente =
    onboarding !== null && onboarding.access !== 'none' && onboarding.progress.percent < 100

  // Prioridade do banner: quem ainda não terminou a trilha inicial precisa
  // dela em primeiro lugar — é a primeira coisa que a pessoa tem a fazer na
  // empresa. Só depois entra "continue de onde parou". Sem nenhum dos dois,
  // não se inventa destaque: banner falso é pior que ausência de banner.
  return (
    <div className="flex flex-col gap-10">
      {trilhaPendente ? (
        <HeroBanner
          rotulo="Comece por aqui"
          titulo={onboarding!.title}
          subtitulo={
            onboarding!.description ??
            `${onboarding!.lessonCount} ${onboarding!.lessonCount === 1 ? 'aula' : 'aulas'} sobre a empresa`
          }
          coverUrl={onboarding!.coverUrl}
          href={`/curso/${onboarding!.slug}`}
          textoBotao={onboarding!.progress.completed > 0 ? 'Continuar' : 'Começar'}
        />
      ) : continuar ? (
        <HeroBanner
          rotulo="Continue de onde parou"
          titulo={continuar.lessonTitle}
          subtitulo={continuar.courseTitle}
          coverUrl={null}
          href={`/curso/${continuar.courseSlug}/aula/${continuar.lessonSlug}`}
          textoBotao="Continuar"
        />
      ) : (
        <header>
          <h1 className="text-xl font-semibold">Olá, {user!.fullName.split(' ')[0]}</h1>
        </header>
      )}

      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-texto-suave">
          Explore por área
        </h2>
        {areas.length === 0 ? (
          <p className="text-sm text-texto-suave">
            Nenhum curso publicado ainda. Assim que os líderes publicarem, as áreas aparecem aqui.
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {areas.map((area) => (
              <AreaCard key={area.key} area={area} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 4: Rodar tudo**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: PASS, e `/` aparece na tabela de rotas do build.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/page.tsx" src/components/catalog/area-card.tsx src/components/catalog/hero-banner.tsx
git commit -m "feat(home): banner adaptativo e vitrine de areas no lugar da lista de cursos"
```

---

### Task 5: A página da área

**Files:**
- Create: `src/app/(app)/area/[slug]/page.tsx`

**Interfaces:**
- Consumes: `getCatalog` de `catalog.ts`; `CourseCard` de `components/catalog/course-card.tsx`; `Catalog` de `catalog-query.ts`.
- Produces: rota `/area/[slug]`.

- [ ] **Step 1: Criar a página**

Crie `src/app/(app)/area/[slug]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { CourseCard } from '@/components/catalog/course-card'
import { getCatalog } from '@/server/catalog'

/*
 * A página reusa getCatalog() em vez de uma consulta por área.
 *
 * Vantagem: atravessa exatamente o mesmo caminho de acesso que a vitrine —
 * mesma consulta, mesma decisão por curso, mesmos testes de banco. Uma
 * consulta nova por área seria uma segunda superfície de acesso para manter
 * em sincronia com a primeira.
 *
 * Custo: carrega o catálogo inteiro para exibir uma área. Para uma empresa de
 * algumas dezenas de pessoas e algumas dezenas de cursos, isso é uma consulta
 * pequena. Se um dia a plataforma tiver centenas de cursos, aqui é o lugar
 * de trocar por uma consulta filtrada — e o teste desta tela não muda.
 */
export default async function AreaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const catalog = await getCatalog()

  const grupo = catalog.grupos.find((g) => g.areaSlug === slug)
  if (!grupo) notFound()

  const emAndamento = grupo.items.filter(
    (item) => item.access !== 'none' && item.progress.completed > 0 && item.progress.percent < 100,
  )

  return (
    <div className="flex flex-col gap-8">
      <section
        className="relative overflow-hidden rounded-card border border-borda"
        style={grupo.areaCoverUrl ? undefined : { backgroundColor: grupo.areaColor ?? '#353133' }}
      >
        {grupo.areaCoverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={grupo.areaCoverUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/88 via-black/50 to-black/20" />
        <div className="relative flex min-h-36 flex-col justify-end p-6">
          <h1 className="text-2xl font-bold leading-tight text-white">{grupo.areaName}</h1>
          <p className="mt-1 text-sm text-white/75">
            {grupo.items.length} {grupo.items.length === 1 ? 'curso' : 'cursos'}
          </p>
        </div>
      </section>

      {emAndamento.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-texto-suave">
            Continue de onde parou
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {emAndamento.map((item) => (
              <CourseCard key={item.id} item={item} />
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-texto-suave">
          Todos os cursos
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {grupo.items.map((item) => (
            <CourseCard key={item.id} item={item} />
          ))}
        </ul>
      </section>
    </div>
  )
}
```

**Nota sobre a área vazia:** a spec pede que uma área existente sem curso publicado abra com o cabeçalho e uma linha explicando. Como `catalog.grupos` só contém áreas que têm curso, esse caso cai no `notFound()` acima. É o comportamento aceito: uma área sem curso publicado não é alcançável pela vitrine, e o único jeito de chegar nela é digitando a URL. Registre isto no seu relatório — o controlador decide se vale uma consulta extra só para diferenciar "área não existe" de "área existe e está vazia".

- [ ] **Step 2: Rodar tudo**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: PASS, e `/area/[slug]` aparece na tabela de rotas do build.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/area"
git commit -m "feat(area): pagina de area com capa, retomada e grade de cursos"
```

---

### Task 6: E2E do fluxo e fechamento

**Files:**
- Create: `e2e/vitrine.spec.ts`

**Interfaces:**
- Consumes: `adminClient`, `criarUsuarioDeTeste`, `criarAreaDeTeste` de `e2e/helpers.ts`.

- [ ] **Step 1: Escrever o spec**

Leia `e2e/acesso-bloqueado.spec.ts` antes — ele é o modelo mais próximo. Siga o mesmo padrão: helper `entrar(page, email)`, constante `SENHA`, `TIMEOUT_CLIQUE = 15000` em todo clique, e `try { … } finally { await limpar(fixtures) }`.

O timeout nos cliques não é enfeite: sem ele um clique travado só é interrompido pelo timeout global de 60s, e aí o `finally` que limpa as fixtures não tem garantia de terminar antes do worker morrer — foi assim que fixtures ficaram presas no banco uma vez.

Crie `e2e/vitrine.spec.ts` cobrindo, num único teste com fixtures próprias:

1. Crie duas áreas de teste, uma com `cover_url` e outra sem, e um curso publicado com uma aula publicada em cada.
2. Crie um colaborador na primeira área e entre com ele.
3. Na home, confirme que a capa da **sua** área aparece e não está marcada como sem acesso, e que a capa da **outra** área aparece com o texto `sem acesso`.
4. Clique na capa da sua área. Confirme a URL `/area/<slug>` e que o título do curso daquela área aparece.
5. Clique no curso e confirme que a página do curso abre (título visível).
6. Volte para a home, clique na área **bloqueada**, e confirme que a página abre e mostra o curso com cadeado — provando que a capa bloqueada não é beco sem saída.

- [ ] **Step 2: Rodar o spec por caminho**

Run: `npx playwright test e2e/vitrine.spec.ts`
Expected: PASS. Rode **pelo menos três vezes** e relate quantas passaram — um spec que passa às vezes é pior que spec nenhum.

**Não** rode `npm run test:e2e` inteiro.

- [ ] **Step 3: Conferir que não sobrou fixture**

Run: `node scripts/limpar-dados-de-teste.mjs`
Expected: `Perfis de teste: 0`, `Áreas de teste: 0`, `Cursos de teste: 0`.

- [ ] **Step 4: Rodar a suíte**

```bash
npm test
npm run test:db
npm run typecheck
npm run lint
npm run build
npx playwright test e2e/acesso-bloqueado.spec.ts
```

Expected: PASS em todas as etapas.

- [ ] **Step 5: Conferência visual à mão**

Com `npm run dev`, percorra e confirme:

1. A home abre **escura**, com a logo no topo.
2. O botão de tema alterna para claro, e a mudança vale também em `/gerenciar`, `/admin/areas` e na página de uma aula com fórum.
3. Recarregue no tema claro: **não pode haver lampejo escuro** antes da página pintar.
4. Em `/admin/areas`, o retângulo vazio mostra `1600 × 1000 px`; em `/gerenciar/cursos/[id]`, mostra `1280 × 800 px`.
5. Nenhuma tela ficou com texto da mesma cor do fundo em nenhum dos dois temas.

- [ ] **Step 6: Commit**

```bash
git add e2e/vitrine.spec.ts
git commit -m "test(vitrine): E2E de home, pagina de area e capa bloqueada"
```

---

## Auto-revisão do plano

Feita contra a spec, com o resultado registrado:

**Cobertura da spec.** §4 rotas → Tasks 4 e 5. §5.1 banner → Task 4. §5.2 grade, contagem, ordem, trilha → Tasks 3 e 4. §5.3 bloqueio → Task 3. §6 página da área → Task 5. §7 tema, paleta, logo → Task 1. §8 capas com medida → Task 2. §9 migration → Task 2. §10 telas de gestão → Task 2. §12 critérios → Task 6.

**Lacuna encontrada na spec e corrigida aqui.** A §10 diz que "o formulário de `/admin/areas` ganha o campo de capa", mas aquela tela só tem formulário de **criar**: `updateArea` existe no servidor e nenhuma tela a usa. Sem edição, uma área já criada — como a "Infra - FunnelOps" que existe hoje em produção — nunca receberia capa, e o recurso não funcionaria para nenhuma área anterior a esta fase. A Task 2, Step 9 acrescenta a edição inline.

**Desvio consciente da spec.** A §6 pede que uma área existente sem curso publicado abra com cabeçalho e aviso. A Task 5 devolve 404 nesse caso, porque `catalog.grupos` só contém áreas com curso. Está anotado no próprio passo para o implementador relatar, e a decisão de gastar uma consulta a mais para diferenciar os dois casos fica com o controlador.

**Consistência de tipos.** `AreaVitrine` (Task 3) é consumido em Task 4 com os mesmos nomes de campo. `AreaRow.coverUrl` (Task 2) é consumido em `area-row.tsx` na mesma tarefa. `CatalogItem.areaSlug`/`areaCoverUrl` (Task 3) alimentam `montarVitrine` na mesma tarefa. `CoverField` tem a mesma assinatura nos três usos.

**Assinaturas conferidas contra o código antes de escrever, não de memória:** `CourseProgress` é `{ completed; total; percent }` (`src/lib/progress/percent.ts`), então a fixture do teste da Task 3 está correta. `criarLixeira()` devolve `{ curso, area, usuario, limpar }` (`tests/db/client.ts:96`), então `lixeira.area(id)` e `lixeira.limpar()` na Task 2 existem de verdade.
