# Redesenho das telas do aluno — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a pele e a estrutura das quatro telas do aluno (Início, Área, Curso, Aula) pela direção aprovada — Vidro GEX, fileiras por área, lista de episódios, sala de aula — sem mudar regra de acesso nem as telas de gestão.

**Architecture:** A pele entra só por tokens de cor em `globals.css` (claro em `@theme`, escuro em `:root.dark`), mais variáveis CSS de página (fundo em degradê e trama). A lógica nova é pura e testada: próxima aula (`src/lib/progress/proxima-aula.ts`), filtros e fileiras (`src/server/vitrine-query.ts`), aba inicial (`src/lib/aula/abas.ts`). As páginas continuam server components; só as abas da aula são client component.

**Tech Stack:** Next.js 16 (App Router, `searchParams` como Promise), React 19, Tailwind v4 (`@theme`), Supabase, Vitest (+ jsdom por arquivo), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-29-gex-academy-redesign-aluno-design.md`

## Global Constraints

- Nenhum componente cita cor literal nem usa variante `dark:`. Cor nova = token novo nos dois blocos de `globals.css`.
- Toda combinação de texto sobre fundo: mínimo **4,5:1**, nos dois temas.
- No tema claro, ciano não é cor de texto nem de ação (≈1,6:1 sobre branco).
- O `<html>` **não** recebe `className` no JSX (ver o comentário em `src/app/layout.tsx`). A fonte entra pelo `<body>`.
- Regra de acesso só em `canAccessCourse` / `can_access_course`. Nenhuma tela decide acesso sozinha.
- Rotas não mudam: `/`, `/area/[slug]`, `/curso/[slug]`, `/curso/[slug]/aula/[lessonSlug]`.
- Telas de gestão (`src/app/(manage)`, `src/app/(admin)`) não são editadas, **exceto** o link da fila de dúvidas (Task 6).
- `npm run db:reset` e `npm run db:types` **nunca**. `npm run test:e2e` inteiro **nunca** — E2E só spec a spec pelo caminho (`primeiro-acesso.spec.ts` manda e-mail de verdade).
- Testes de banco rodam contra o Supabase real: fixture registrado na lixeira (`criarLixeira`) no escopo do módulo; conferir com `node scripts/limpar-dados-de-teste.mjs`.
- Antes de usar API do Next, ler o guia em `node_modules/next/dist/docs/` (esta versão difere da conhecida).
- Textos de tela em português do Brasil.

## Review Focus

1. **Filtro inválido na URL** (`?filtro=xyz`, `?filtro=a&filtro=b`) → a página mostra "Tudo", não quebra. Teste em `lerFiltro` (Task 2).
2. **Aba inválida na URL** (`?aba=qualquer`) → abre em "Sobre". Teste em `lerAba` (Task 6).
3. **Pessoa sem nenhum curso no filtro escolhido** → mensagem de vazio, não página em branco. Teste em `montarFileiras` devolvendo `[]` (Task 2) e o ramo na página (Task 3).
4. **Progresso com ids de aulas que não são do curso** (aula despublicada, de outro curso) → não conta como concluída, não trava o "Continuar". Teste em `acaoDoCurso` (Task 2).
5. **Tela de celular (390px) rolando para o lado** por causa das fileiras horizontais → a página não pode ter rolagem horizontal. Asserção no roteiro de capturas (Task 1), rodado em toda task.

---

## Mapa de arquivos

| Arquivo | Task | Responsabilidade |
|---|---|---|
| `src/app/globals.css` | 1 | tokens novos, fundo e trama da página, fonte |
| `src/app/layout.tsx` | 1 | carrega Geist no `<body>` |
| `src/components/layout/app-shell.tsx` | 1 | barra do topo translúcida |
| `src/components/progress/progress-bar.tsx` | 1, 5 | barra em degradê; tom sobre imagem |
| `src/lib/tema/contraste.ts` (+ teste) | 1 | contraste WCAG com composição de transparência |
| `src/lib/tema/tokens.test.ts` | 1 | lê `globals.css` e mede os pares de token |
| `e2e/capturas.spec.ts` | 1 | capturas das telas nos dois temas, desktop e celular |
| `src/lib/progress/proxima-aula.ts` (+ teste) | 2 | próxima aula, ação do curso, estado de cada aula |
| `src/server/vitrine-query.ts` (+ teste) | 2, 3 | filtros, fileiras, capa com reserva; remoção do que ficou sem uso |
| `src/server/progress.ts` | 2 | `getContinueWatching` devolve posição e totais |
| `src/components/catalog/course-card.tsx` | 3 | card de curso compartilhado |
| `src/components/catalog/filtros-progresso.tsx` | 3 | pílulas de filtro |
| `src/components/catalog/destaque-home.tsx` | 3 | card de vidro "continue" / trilha |
| `src/components/catalog/fileira-area.tsx` | 3 | fileira horizontal de uma área |
| `src/app/(app)/page.tsx` | 3 | Início |
| `e2e/vitrine.spec.ts` | 3 | afirmações da home reescritas para fileiras |
| `src/app/(app)/area/[slug]/page.tsx` | 4 | página da área |
| `src/server/viewer-query.ts` (+ teste) | 5, 6 | `areaCoverUrl` no curso; `indice` na aula |
| `src/components/layout/voltar-circular.tsx` | 5 | botão voltar circular |
| `src/components/curso/banner-curso.tsx` | 5 | banner do curso |
| `src/components/curso/lista-de-episodios.tsx` | 5, 6 | lista de aulas (completa e compacta) |
| `src/components/catalog/locked-course.tsx` | 5 | curso bloqueado com a pele nova |
| `src/app/(app)/curso/[slug]/page.tsx` | 5 | página do curso |
| `src/lib/aula/abas.ts` (+ teste) | 6 | aba inicial a partir da URL |
| `src/components/aula/abas-da-aula.tsx` (+ teste) | 6 | abas acessíveis |
| `src/app/(app)/curso/[slug]/aula/[lessonSlug]/page.tsx` | 6 | sala de aula |
| `src/app/(manage)/gerenciar/duvidas/page.tsx` | 6 | link abre a aba Dúvidas |
| `e2e/forum-e-progresso.spec.ts` | 6 | fórum agora dentro da aba |
| `CLAUDE.md` | 7 | guia do projeto |

Removidos na Task 3 (ficam sem uso): `src/components/catalog/area-card.tsx`, `src/components/catalog/hero-banner.tsx`, e em `vitrine-query.ts` as funções `montarVitrine`, `capaDoCurso`, `corDaAreaDoCurso` e o tipo `AreaVitrine`, com seus testes. `selecionarEmAndamento` sai na Task 4.

---

### Task 1: Sistema visual — tokens, fonte, barra do topo e roteiro de capturas

**Files:**
- Modify: `docs/superpowers/specs/2026-09-29-gex-academy-redesign-aluno-design.md` (seção 5, item 3)
- Create: `src/lib/tema/contraste.ts`, `src/lib/tema/contraste.test.ts`, `src/lib/tema/tokens.test.ts`
- Modify: `src/app/globals.css`, `src/app/layout.tsx`, `src/components/layout/app-shell.tsx`, `src/components/progress/progress-bar.tsx`
- Create: `e2e/capturas.spec.ts`

**Interfaces:**
- Produces: utilitários Tailwind `bg-vidro`, `border-vidro-borda`, `bg-selecionado`, `border-selecionado-borda`, `text-selecionado-texto`, `shadow-destaque`, `font-sans` (Geist). Degradê de progresso = `bg-gradient-to-r from-azul to-ciano` (tokens fixos já existentes).
- Produces: `lerCor(texto: string): { r: number; g: number; b: number; a: number }`, `comporSobre(frente: string, fundo: string): string`, `razaoDeContraste(a: string, b: string): number`.
- Produces: `e2e/capturas.spec.ts`, rodado com `CAPTURAS=1 npx playwright test e2e/capturas.spec.ts`, grava em `test-results/capturas/`.

- [ ] **Step 1: Corrigir a ordem do destaque na spec**

A spec diz que a regra do destaque "continua em `escolherDestaque`", mas lista a ordem ao contrário do código. Em `src/server/vitrine-query.ts`, `escolherDestaque` dá prioridade à **trilha inicial incompleta**. Na seção 5, item 3, substituir as três linhas da lista por:

```markdown
   - trilha inicial com acesso e ainda não concluída → a trilha, com botão **Começar** (ou **Continuar**, se já começou);
   - sem trilha pendente, com aula a retomar → esse curso, botão **Continuar**;
   - sem nenhum dos dois → o destaque não aparece.
```

- [ ] **Step 2: Teste do contraste (falha)**

`src/lib/tema/contraste.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { comporSobre, lerCor, razaoDeContraste } from './contraste'

describe('lerCor', () => {
  it('lê hexadecimal de 6 dígitos', () => {
    expect(lerCor('#004eac')).toEqual({ r: 0, g: 78, b: 172, a: 1 })
  })
  it('lê rgb com barra de opacidade (sintaxe do CSS moderno)', () => {
    expect(lerCor('rgb(1 205 255 / 0.16)')).toEqual({ r: 1, g: 205, b: 255, a: 0.16 })
  })
  it('lê rgba com vírgulas', () => {
    expect(lerCor('rgba(255, 255, 255, 0.5)')).toEqual({ r: 255, g: 255, b: 255, a: 0.5 })
  })
  it('recusa o que não é cor, em vez de devolver preto em silêncio', () => {
    expect(() => lerCor('var(--x)')).toThrow()
  })
})

describe('razaoDeContraste', () => {
  it('preto sobre branco é 21:1', () => {
    expect(razaoDeContraste('#000000', '#ffffff')).toBeCloseTo(21, 1)
  })
  it('é simétrica', () => {
    expect(razaoDeContraste('#004eac', '#ffffff')).toBeCloseTo(razaoDeContraste('#ffffff', '#004eac'), 5)
  })
})

describe('comporSobre', () => {
  it('cor opaca não muda', () => {
    expect(comporSobre('#004eac', '#ffffff')).toBe('#004eac')
  })
  it('50% de branco sobre preto dá cinza médio', () => {
    expect(comporSobre('rgb(255 255 255 / 0.5)', '#000000')).toBe('#808080')
  })
})
```

Run: `npx vitest run src/lib/tema/contraste.test.ts` — Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `contraste.ts`**

```ts
/**
 * Contraste WCAG 2.x, com composição de transparência.
 *
 * A pele nova usa superfícies translúcidas (vidro, selecionado). Medir texto
 * contra a cor translúcida crua daria um número falso — o que o olho vê é a
 * cor COMPOSTA sobre o fundo de baixo. Por isso `comporSobre` existe, e o
 * teste de tokens compõe antes de medir.
 */
export type Cor = { r: number; g: number; b: number; a: number }

export function lerCor(texto: string): Cor {
  const t = texto.trim().toLowerCase()
  const hex = t.match(/^#([0-9a-f]{6})$/)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 }
  }
  const fn = t.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[/,]\s*([\d.]+))?\s*\)$/)
  if (fn) {
    return { r: Number(fn[1]), g: Number(fn[2]), b: Number(fn[3]), a: fn[4] === undefined ? 1 : Number(fn[4]) }
  }
  throw new Error(`Cor não reconhecida: ${texto}`)
}

function paraHex({ r, g, b }: Cor): string {
  return '#' + [r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')
}

export function comporSobre(frente: string, fundo: string): string {
  const f = lerCor(frente)
  const b = lerCor(fundo)
  return paraHex({
    r: f.r * f.a + b.r * (1 - f.a),
    g: f.g * f.a + b.g * (1 - f.a),
    b: f.b * f.a + b.b * (1 - f.a),
    a: 1,
  })
}

function linear(canal: number): number {
  const c = canal / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function luminancia(cor: string): number {
  const { r, g, b } = lerCor(cor)
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

export function razaoDeContraste(a: string, b: string): number {
  const la = luminancia(a)
  const lb = luminancia(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}
```

Run: `npx vitest run src/lib/tema/contraste.test.ts` — Expected: PASS.

- [ ] **Step 4: Teste dos tokens (falha)**

`src/lib/tema/tokens.test.ts` lê o `globals.css` de verdade — o teste acompanha qualquer mudança de cor sem ninguém lembrar de atualizá-lo:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { comporSobre, razaoDeContraste } from './contraste'

const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')

function bloco(abertura: string): string {
  const inicio = css.indexOf(abertura)
  if (inicio === -1) throw new Error(`bloco ${abertura} não encontrado`)
  return css.slice(inicio, css.indexOf('\n}', inicio))
}

function tokens(trecho: string): Record<string, string> {
  const saida: Record<string, string> = {}
  for (const m of trecho.matchAll(/--color-([a-z0-9-]+):\s*([^;]+);/g)) saida[m[1]] = m[2].trim()
  return saida
}

const claro = tokens(bloco('@theme {'))
const escuro = { ...claro, ...tokens(bloco(':root.dark {')) }

// No escuro o fundo da página é um degradê; o ponto MAIS CLARO dele
// (#0e2a55, topo) é o pior caso para texto claro por cima. Superfícies
// translúcidas são compostas sobre esse ponto antes de medir.
const PIOR_FUNDO_ESCURO = '#0e2a55'

type Par = [rotulo: string, texto: string, fundo: string]

function pares(t: Record<string, string>, base: string): Par[] {
  return [
    ['texto sobre fundo', t['texto'], t['fundo']],
    ['texto-suave sobre fundo', t['texto-suave'], t['fundo']],
    ['texto sobre superfície', t['texto'], t['superficie']],
    ['texto-suave sobre superfície', t['texto-suave'], t['superficie']],
    ['texto sobre vidro', t['texto'], comporSobre(t['vidro'], base)],
    ['texto-suave sobre vidro', t['texto-suave'], comporSobre(t['vidro'], base)],
    ['selecionado-texto sobre selecionado', t['selecionado-texto'], comporSobre(t['selecionado'], base)],
    ['acao-texto sobre acao', t['acao-texto'], t['acao']],
    // O selo "Concluída" e as mensagens de sucesso. No claro, o #1f8a4c de
    // antes dava 4,38:1 sobre branco — abaixo do mínimo, e já em uso.
    ['sucesso sobre superfície', t['sucesso'], t['superficie']],
  ]
}

describe.each([
  ['claro', claro, claro['fundo']],
  ['escuro', escuro, PIOR_FUNDO_ESCURO],
])('tokens do tema %s passam 4,5:1', (_nome, t, base) => {
  it.each(pares(t, base))('%s', (_rotulo, texto, fundo) => {
    expect(texto, 'token ausente').toBeDefined()
    expect(razaoDeContraste(texto, fundo)).toBeGreaterThanOrEqual(4.5)
  })
})
```

Run: `npx vitest run src/lib/tema/tokens.test.ts` — Expected: FAIL (tokens `vidro`, `selecionado*` inexistentes).

- [ ] **Step 5: Tokens novos em `globals.css`**

No bloco `@theme`, trocar `--color-fundo`, `--color-borda`, `--color-texto-suave` e acrescentar os tokens novos e a fonte:

```css
  --color-fundo: #f3f6fb;
  --color-borda: #dbe6f5;
  --color-texto-suave: #55627a;
  /* Era #1f8a4c: 4,38:1 sobre branco, abaixo do mínimo — defeito anterior a
     este redesenho, achado quando o teste de tokens passou a medir o par. */
  --color-sucesso: #17753f;

  /* Pele "Vidro GEX" (spec 2026-09-29, seção 4). No claro não há vidro de
     verdade: as superfícies são sólidas, e só o escuro ganha transparência
     e brilho — vidro sobre fundo claro some. */
  --color-vidro: #ffffff;
  --color-vidro-borda: #dbe6f5;
  /* Item selecionado (pílula de filtro, aula atual, aba ativa): contorno em
     vez de preenchimento sólido — o detalhe que o dono do produto apontou na
     direção escolhida. No claro é azul; ciano sobre branco é ilegível. */
  --color-selecionado: #e8f0fa;
  --color-selecionado-borda: #7fa6d9;
  --color-selecionado-texto: #004eac;

  --shadow-destaque: 0 12px 32px -16px rgb(15 40 80 / 0.18);

  --font-sans: var(--font-geist), ui-sans-serif, system-ui, sans-serif;
```

No bloco `:root.dark`, trocar a família neutra quente pelo azul-marinho e acrescentar:

```css
  --color-superficie: #0d1a30;
  --color-fundo: #070f1f;
  --color-borda: #1c2c47;
  --color-texto: #eef3fb;
  --color-texto-suave: #9fb0cc;

  --color-vidro: rgb(255 255 255 / 0.045);
  --color-vidro-borda: rgb(120 170 255 / 0.16);
  --color-selecionado: rgb(1 205 255 / 0.16);
  --color-selecionado-borda: rgb(1 205 255 / 0.5);
  --color-selecionado-texto: #d8f6ff;

  --shadow-destaque: inset 0 1px 0 rgb(255 255 255 / 0.08), 0 20px 40px -20px rgb(1 205 255 / 0.25);
```

Substituir a regra `body { ... }` do fim do arquivo por:

```css
/* Fundo e trama da página. Não são cores (um é degradê, outro é padrão de
   imagem), então vivem fora do @theme — mas seguem a mesma regra: o claro é
   a base, o escuro redefine. */
:root {
  --fundo-pagina: var(--color-fundo);
  --trama: none;
}
:root.dark {
  --fundo-pagina: radial-gradient(120% 70% at 15% -10%, #0e2a55 0%, #081429 45%, #050a16 100%);
  --trama: radial-gradient(rgb(255 255 255 / 0.035) 1px, transparent 1px);
}

body {
  min-height: 100dvh;
  background: var(--fundo-pagina) fixed;
  background-color: var(--color-fundo);
  color: var(--color-texto);
  /* No body, não no html: é o body que recebe a classe do next/font
     (layout.tsx), então é só daqui para dentro que --font-geist existe. */
  font-family: var(--font-sans);
}

/* A trama de pontos. z-index -1 a põe atrás de todo o conteúdo e na frente
   do fundo; pointer-events none para nunca interceptar clique. */
body::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: -1;
  background-image: var(--trama);
  background-size: 18px 18px;
  pointer-events: none;
}
```

Run: `npx vitest run src/lib/tema/tokens.test.ts` — Expected: PASS. Se algum par falhar, ajustar **o valor do token** até passar e anotar o valor final no relatório; não baixar o limite.

- [ ] **Step 6: Fonte Geist no `<body>`**

Ler antes `node_modules/next/dist/docs/01-app/01-getting-started/13-fonts.md`. Em `src/app/layout.tsx`:

```tsx
import { Geist } from 'next/font/google'
```

Logo abaixo dos imports:

```tsx
// Geist hospedada pelo próprio Next (sem requisição ao Google no navegador).
// `variable`, não `className`: a fonte vira a variável --font-geist, que o
// --font-sans de globals.css consome. Aplicada no <body>, NUNCA no <html> —
// ver o comentário sobre o remonte do Strict Mode mais abaixo.
const geist = Geist({ subsets: ['latin'], variable: '--font-geist' })
```

E trocar `<body>{children}</body>` por `<body className={geist.variable}>{children}</body>`.

- [ ] **Step 7: Barra do topo translúcida**

Em `src/components/layout/app-shell.tsx`, trocar a classe do `<header>`:

```tsx
      {/*
        Fixa no topo e translúcida: o conteúdo passa por baixo desfocado.
        bg-fundo/75, não bg-vidro: o vidro (4,5% de branco) seria
        transparente demais para ler o menu sobre uma capa rolando por baixo.
      */}
      <header className="sticky top-0 z-30 border-b border-vidro-borda bg-fundo/75 backdrop-blur-md">
```

- [ ] **Step 8: Barra de progresso em degradê**

Em `src/components/progress/progress-bar.tsx`, trocar a div interna:

```tsx
        <div className="h-full bg-gradient-to-r from-azul to-ciano" style={{ width: `${percent}%` }} />
```

O texto "X de N aulas concluídas · P%" **não muda** — `e2e/forum-e-progresso.spec.ts` procura exatamente essa frase.

- [ ] **Step 9: Roteiro de capturas**

`e2e/capturas.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test'
import { CHAVE_TEMA } from '../src/lib/tema/tema'
import { adminClient, criarUsuarioDeTeste } from './helpers'

/**
 * Captura as telas do aluno nos dois temas, em desktop e celular, para
 * conferência visual a cada etapa do redesenho. Não é teste de regressão —
 * só roda quando pedido:
 *
 *   CAPTURAS=1 npx playwright test e2e/capturas.spec.ts
 *
 * Usa os dados REAIS (áreas, cursos e aulas que existem no banco), vistos por
 * um admin temporário criado sem e-mail (createUser) e apagado no fim.
 */
test.skip(!process.env.CAPTURAS, 'só roda com CAPTURAS=1')

const SENHA = 'senha-de-teste-123'
const TAMANHOS = [
  { nome: 'desktop', width: 1440, height: 900 },
  { nome: 'celular', width: 390, height: 844 },
] as const
const TEMAS = ['dark', 'light'] as const

async function capturar(page: Page, rota: string, nome: string) {
  for (const tema of TEMAS) {
    for (const t of TAMANHOS) {
      await page.addInitScript(
        ([chave, valor]) => localStorage.setItem(chave, valor),
        [CHAVE_TEMA, tema] as const,
      )
      await page.setViewportSize({ width: t.width, height: t.height })
      await page.goto(rota)
      await page.waitForLoadState('networkidle')
      // Review Focus 5: nenhuma tela pode rolar para o lado no celular.
      const vaza = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
      expect(vaza, `${nome} (${tema}, ${t.nome}) rola na horizontal`).toBe(false)
      await page.screenshot({ path: `test-results/capturas/${nome}-${tema}-${t.nome}.png`, fullPage: true })
    }
  }
}

test('capturas das telas do aluno', async ({ page }) => {
  test.setTimeout(240000)
  const db = adminClient()
  const stamp = Date.now()
  const email = `capturas-${stamp}@gexcorp.com.br`
  const userId = await criarUsuarioDeTeste({ email, senha: SENHA, fullName: 'Capturas Redesenho', role: 'admin' })

  try {
    const { data: aula } = await db
      .from('lessons')
      .select('slug, courses!inner(slug, status, areas!inner(slug))')
      .eq('status', 'published')
      .eq('courses.status', 'published')
      .limit(1)
      .single()
    if (!aula) throw new Error('nenhuma aula publicada no banco para capturar')
    const curso = aula.courses as unknown as { slug: string; areas: { slug: string } }

    await page.goto('/login')
    await page.getByLabel('E-mail').fill(email)
    await page.getByLabel('Senha').fill(SENHA)
    await page.getByRole('button', { name: 'Entrar' }).click({ timeout: 15000 })
    await expect(page).toHaveURL('/')

    await capturar(page, '/', 'inicio')
    await capturar(page, '/?filtro=continuar', 'inicio-filtro')
    await capturar(page, `/area/${curso.areas.slug}`, 'area')
    await capturar(page, `/curso/${curso.slug}`, 'curso')
    await capturar(page, `/curso/${curso.slug}/aula/${aula.slug}`, 'aula')
  } finally {
    await db.auth.admin.deleteUser(userId)
  }
})
```

- [ ] **Step 10: Verificar**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: tudo verde.

Run: `CAPTURAS=1 npx playwright test e2e/capturas.spec.ts`
Expected: PASS, 40 arquivos em `test-results/capturas/`. **Abrir e olhar** pelo menos `inicio-dark-desktop.png`, `inicio-light-desktop.png` e `inicio-dark-celular.png`: fundo azul-marinho com trama no escuro, cinza-azulado no claro, fonte Geist, barra do topo translúcida. Depois: `node scripts/limpar-dados-de-teste.mjs` — Expected: 0 perfis de teste.

- [ ] **Step 11: Commit**

```bash
git add docs/superpowers/specs/2026-09-29-gex-academy-redesign-aluno-design.md src/lib/tema/contraste.ts src/lib/tema/contraste.test.ts src/lib/tema/tokens.test.ts src/app/globals.css src/app/layout.tsx src/components/layout/app-shell.tsx src/components/progress/progress-bar.tsx e2e/capturas.spec.ts
git commit -m "feat(tema): pele Vidro GEX — tokens, fonte Geist, barra do topo e teste de contraste dos tokens"
```

---

### Task 2: Regras puras — próxima aula, filtros e fileiras

**Files:**
- Create: `src/lib/progress/proxima-aula.ts`, `src/lib/progress/proxima-aula.test.ts`
- Modify: `src/server/vitrine-query.ts`, `src/server/vitrine-query.test.ts`
- Modify: `src/server/progress.ts` (`getContinueWatching`)

**Interfaces:**
- Consumes: `CatalogItem`, `Catalog` (`src/server/catalog-query.ts`); `AreaRow` (`src/server/areas.ts`).
- Produces (`proxima-aula.ts`):
  - `type AcaoDoCurso = { tipo: 'comecar'; indice: number } | { tipo: 'continuar'; indice: number } | { tipo: 'rever'; indice: 0 } | { tipo: 'nenhuma' }`
  - `acaoDoCurso(aulas: readonly { id: string }[], concluidas: ReadonlySet<string>): AcaoDoCurso`
  - `type EstadoDaAula = 'concluida' | 'assistindo' | 'nao-iniciada'`
  - `estadoDasAulas(aulas: readonly { id: string }[], concluidas: ReadonlySet<string>): EstadoDaAula[]`
- Produces (`vitrine-query.ts`):
  - `type FiltroProgresso = 'tudo' | 'continuar' | 'nao-iniciados' | 'concluidos'`
  - `lerFiltro(valor: string | string[] | undefined): FiltroProgresso`
  - `passaNoFiltro(item: CatalogItem, filtro: FiltroProgresso): boolean`
  - `capaComReserva(item: { coverUrl: string | null; areaCoverUrl: string | null }): string | null`
  - `itemDoCatalogo(catalog: Catalog, slug: string): CatalogItem | null`
  - `type Fileira = { key: string; areaName: string; areaSlug: string; items: CatalogItem[] }`
  - `montarFileiras(catalog: Catalog, todasAsAreas: readonly AreaRow[], filtro: FiltroProgresso): Fileira[]`
- Produces (`progress.ts`): `getContinueWatching()` devolve também `lessonNumber: number` (1-based), `lessonCount: number`, `completedCount: number`.

- [ ] **Step 1: Teste da próxima aula (falha)**

`src/lib/progress/proxima-aula.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { acaoDoCurso, estadoDasAulas } from './proxima-aula'

const aulas = [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }]

describe('acaoDoCurso', () => {
  it('curso sem aula não tem ação', () => {
    expect(acaoDoCurso([], new Set())).toEqual({ tipo: 'nenhuma' })
  })
  it('nada concluído → começar pela primeira', () => {
    expect(acaoDoCurso(aulas, new Set())).toEqual({ tipo: 'comecar', indice: 0 })
  })
  it('algumas concluídas → continuar pela primeira NÃO concluída', () => {
    expect(acaoDoCurso(aulas, new Set(['a1']))).toEqual({ tipo: 'continuar', indice: 1 })
  })
  it('concluiu fora de ordem → continuar pela primeira que falta, não pela seguinte à última', () => {
    expect(acaoDoCurso(aulas, new Set(['a2']))).toEqual({ tipo: 'continuar', indice: 0 })
  })
  it('todas concluídas → rever do começo', () => {
    expect(acaoDoCurso(aulas, new Set(['a1', 'a2', 'a3']))).toEqual({ tipo: 'rever', indice: 0 })
  })
  // Review Focus 4: progresso de aula que não é deste curso (despublicada, de
  // outro curso) não pode contar como avanço aqui.
  it('ids que não são do curso não contam como concluídos', () => {
    expect(acaoDoCurso(aulas, new Set(['x9', 'outra']))).toEqual({ tipo: 'comecar', indice: 0 })
  })
})

describe('estadoDasAulas', () => {
  it('marca concluídas, a próxima como assistindo e o resto como não iniciada', () => {
    expect(estadoDasAulas(aulas, new Set(['a1']))).toEqual(['concluida', 'assistindo', 'nao-iniciada'])
  })
  it('nada concluído → a primeira é a assistindo', () => {
    expect(estadoDasAulas(aulas, new Set())).toEqual(['assistindo', 'nao-iniciada', 'nao-iniciada'])
  })
  it('curso todo concluído → nenhuma assistindo', () => {
    expect(estadoDasAulas(aulas, new Set(['a1', 'a2', 'a3']))).toEqual(['concluida', 'concluida', 'concluida'])
  })
  it('curso sem aula → lista vazia', () => {
    expect(estadoDasAulas([], new Set())).toEqual([])
  })
})
```

Run: `npx vitest run src/lib/progress/proxima-aula.test.ts` — Expected: FAIL.

- [ ] **Step 2: Implementar `proxima-aula.ts`**

```ts
/**
 * A próxima aula de um curso: a primeira NÃO concluída, na ordem do curso.
 *
 * Única fonte para três lugares que precisam concordar (spec 2026-09-29,
 * seção 9.1): o botão do banner do curso, o selo "Assistindo" da lista de
 * episódios e o destaque da lista lateral da sala de aula. Também é ela que
 * getContinueWatching usa para escolher onde retomar.
 */
export type AcaoDoCurso =
  | { tipo: 'comecar'; indice: number }
  | { tipo: 'continuar'; indice: number }
  | { tipo: 'rever'; indice: 0 }
  | { tipo: 'nenhuma' }

export function acaoDoCurso(aulas: readonly { id: string }[], concluidas: ReadonlySet<string>): AcaoDoCurso {
  if (aulas.length === 0) return { tipo: 'nenhuma' }
  const indice = aulas.findIndex((a) => !concluidas.has(a.id))
  if (indice === -1) return { tipo: 'rever', indice: 0 }
  // Conta só as aulas DESTE curso: `concluidas` pode trazer ids de aula
  // despublicada ou de outro curso, que não são avanço aqui.
  const algumaConcluida = aulas.some((a) => concluidas.has(a.id))
  return algumaConcluida ? { tipo: 'continuar', indice } : { tipo: 'comecar', indice }
}

export type EstadoDaAula = 'concluida' | 'assistindo' | 'nao-iniciada'

export function estadoDasAulas(aulas: readonly { id: string }[], concluidas: ReadonlySet<string>): EstadoDaAula[] {
  const acao = acaoDoCurso(aulas, concluidas)
  const atual = acao.tipo === 'comecar' || acao.tipo === 'continuar' ? acao.indice : -1
  return aulas.map((a, i) => (concluidas.has(a.id) ? 'concluida' : i === atual ? 'assistindo' : 'nao-iniciada'))
}
```

Run: `npx vitest run src/lib/progress/proxima-aula.test.ts` — Expected: PASS.

- [ ] **Step 3: Testes de filtro, reserva de capa e fileiras (falha)**

Acrescentar ao fim de `src/server/vitrine-query.test.ts` (os helpers `item`, `grupo`, `catalogo` e `areaRow` já existem no arquivo), e somar `capaComReserva, itemDoCatalogo, lerFiltro, montarFileiras, passaNoFiltro` ao import de `./vitrine-query`:

```ts
describe('lerFiltro', () => {
  it.each([
    ['continuar', 'continuar'],
    ['nao-iniciados', 'nao-iniciados'],
    ['concluidos', 'concluidos'],
    ['tudo', 'tudo'],
  ])('%s → %s', (valor, esperado) => {
    expect(lerFiltro(valor)).toBe(esperado)
  })
  // Review Focus 1: URL é entrada de usuário.
  it('ausente, desconhecido ou repetido → tudo', () => {
    expect(lerFiltro(undefined)).toBe('tudo')
    expect(lerFiltro('xyz')).toBe('tudo')
    expect(lerFiltro(['continuar', 'concluidos'])).toBe('tudo')
  })
})

describe('passaNoFiltro', () => {
  const p = (completed: number, total: number) => ({ completed, total, percent: total ? Math.round((completed / total) * 100) : 0 })

  it('tudo aceita inclusive bloqueado', () => {
    expect(passaNoFiltro(item({ access: 'none' }), 'tudo')).toBe(true)
  })
  it('bloqueado não entra em nenhum outro filtro', () => {
    const bloqueado = item({ access: 'none', progress: p(0, 3) })
    expect(passaNoFiltro(bloqueado, 'nao-iniciados')).toBe(false)
    expect(passaNoFiltro(bloqueado, 'continuar')).toBe(false)
    expect(passaNoFiltro(bloqueado, 'concluidos')).toBe(false)
  })
  it('continuar = começou e não terminou', () => {
    expect(passaNoFiltro(item({ progress: p(1, 3) }), 'continuar')).toBe(true)
    expect(passaNoFiltro(item({ progress: p(0, 3) }), 'continuar')).toBe(false)
    expect(passaNoFiltro(item({ progress: p(3, 3) }), 'continuar')).toBe(false)
  })
  it('não iniciados = nada concluído, com aula', () => {
    expect(passaNoFiltro(item({ progress: p(0, 3) }), 'nao-iniciados')).toBe(true)
    expect(passaNoFiltro(item({ progress: p(0, 0) }), 'nao-iniciados')).toBe(false)
  })
  it('concluídos = todas, com aula', () => {
    expect(passaNoFiltro(item({ progress: p(3, 3) }), 'concluidos')).toBe(true)
    expect(passaNoFiltro(item({ progress: p(0, 0) }), 'concluidos')).toBe(false)
  })
})

describe('capaComReserva', () => {
  it('prefere a capa do curso', () => {
    expect(capaComReserva({ coverUrl: 'c.png', areaCoverUrl: 'a.png' })).toBe('c.png')
  })
  it('sem capa do curso, usa a da área', () => {
    expect(capaComReserva({ coverUrl: null, areaCoverUrl: 'a.png' })).toBe('a.png')
  })
  it('sem nenhuma, null — quem desenha usa o degradê de reserva', () => {
    expect(capaComReserva({ coverUrl: null, areaCoverUrl: null })).toBeNull()
  })
})

describe('itemDoCatalogo', () => {
  it('acha em qualquer grupo e na trilha', () => {
    const cat = catalogo([grupo({ items: [item({ slug: 'x' })] })], item({ slug: 'trilha', isOnboarding: true }))
    expect(itemDoCatalogo(cat, 'x')?.slug).toBe('x')
    expect(itemDoCatalogo(cat, 'trilha')?.slug).toBe('trilha')
    expect(itemDoCatalogo(cat, 'nao-existe')).toBeNull()
  })
})

describe('montarFileiras', () => {
  const p = (completed: number, total: number) => ({ completed, total, percent: total ? Math.round((completed / total) * 100) : 0 })

  it('uma fileira por área com curso, na ordem do catálogo', () => {
    const cat = catalogo([
      grupo({ groupKey: 'a1', areaName: 'Copy', areaSlug: 'copy', items: [item({ id: 'c1' })] }),
      grupo({ groupKey: 'a2', areaName: 'Tráfego', areaSlug: 'trafego', items: [item({ id: 'c2' })] }),
    ])
    expect(montarFileiras(cat, [], 'tudo').map((f) => f.areaSlug)).toEqual(['copy', 'trafego'])
  })
  it('área sem curso entra no fim, vazia (o card "Em breve")', () => {
    const cat = catalogo([grupo({ groupKey: 'a1', areaSlug: 'copy', items: [item()] })])
    const fileiras = montarFileiras(cat, [areaRow({ id: 'a1', slug: 'copy' }), areaRow({ id: 'a9', name: 'Design', slug: 'design' })], 'tudo')
    expect(fileiras.map((f) => [f.areaSlug, f.items.length])).toEqual([['copy', 1], ['design', 0]])
  })
  it('grupo sem slug (o "Outros") não vira fileira', () => {
    expect(montarFileiras(catalogo([grupo({ areaSlug: null })]), [], 'tudo')).toEqual([])
  })
  it('com filtro, fileira que esvazia some — inclusive as de área sem curso', () => {
    const cat = catalogo([
      grupo({ groupKey: 'a1', areaSlug: 'copy', items: [item({ id: 'c1', progress: p(1, 3) })] }),
      grupo({ groupKey: 'a2', areaSlug: 'trafego', items: [item({ id: 'c2', progress: p(0, 3) })] }),
    ])
    const fileiras = montarFileiras(cat, [areaRow({ id: 'a9', slug: 'design' })], 'continuar')
    expect(fileiras.map((f) => f.areaSlug)).toEqual(['copy'])
  })
  // Review Focus 3.
  it('nada passa no filtro → nenhuma fileira', () => {
    const cat = catalogo([grupo({ items: [item({ progress: p(0, 3) })] })])
    expect(montarFileiras(cat, [], 'concluidos')).toEqual([])
  })
})
```

Run: `npx vitest run src/server/vitrine-query.test.ts` — Expected: FAIL (funções inexistentes).

- [ ] **Step 4: Implementar em `vitrine-query.ts`**

Renomear a função interna `encontrarItemDoCatalogo` para `itemDoCatalogo` e exportá-la (atualizar as chamadas internas). Acrescentar ao fim do arquivo:

```ts
export type FiltroProgresso = 'tudo' | 'continuar' | 'nao-iniciados' | 'concluidos'

const FILTROS: readonly FiltroProgresso[] = ['tudo', 'continuar', 'nao-iniciados', 'concluidos']

/** O filtro da home vem da URL (`?filtro=`) — entrada de usuário: o que não for um valor conhecido é "tudo". */
export function lerFiltro(valor: string | string[] | undefined): FiltroProgresso {
  return typeof valor === 'string' && (FILTROS as readonly string[]).includes(valor) ? (valor as FiltroProgresso) : 'tudo'
}

/**
 * Spec 2026-09-29, seção 9.2. Curso bloqueado só aparece em "tudo": listar
 * em "Não iniciados" algo que a pessoa nem pode abrir não faz sentido.
 */
export function passaNoFiltro(item: CatalogItem, filtro: FiltroProgresso): boolean {
  if (filtro === 'tudo') return true
  if (item.access === 'none') return false
  const { completed, total } = item.progress
  if (filtro === 'continuar') return completed > 0 && completed < total
  if (filtro === 'nao-iniciados') return total > 0 && completed === 0
  return total > 0 && completed === total
}

/**
 * Capa de um curso com reserva (spec, seção 9.4): a do curso, senão a da
 * área. Null = quem desenha usa o degradê de reserva. Hoje nenhum curso tem
 * capa própria — sem este degrau a vitrine inteira seria degradê.
 */
export function capaComReserva(item: { coverUrl: string | null; areaCoverUrl: string | null }): string | null {
  return item.coverUrl ?? item.areaCoverUrl ?? null
}

export type Fileira = {
  /** Chave estável de lista React: o areaId. */
  key: string
  areaName: string
  areaSlug: string
  /** Vazia = área sem curso publicado: a fileira mostra um card "Em breve". */
  items: CatalogItem[]
}

/**
 * As fileiras da home (spec, seção 5): uma por área, na ordem do catálogo,
 * com as áreas sem curso no fim. Com filtro, fileira que esvazia some — e
 * área sem curso também, porque "Em breve" não é resposta a "Continuar".
 * A trilha inicial não entra: ela é curso, não área, e tem o destaque.
 */
export function montarFileiras(
  catalog: Catalog,
  todasAsAreas: readonly AreaRow[],
  filtro: FiltroProgresso,
): Fileira[] {
  const fileiras: Fileira[] = []

  for (const grupo of catalog.grupos) {
    if (!grupo.areaSlug) continue
    const items = grupo.items.filter((i) => passaNoFiltro(i, filtro))
    if (filtro !== 'tudo' && items.length === 0) continue
    fileiras.push({ key: grupo.groupKey, areaName: grupo.areaName, areaSlug: grupo.areaSlug, items })
  }

  if (filtro === 'tudo') {
    const comCurso = new Set(catalog.grupos.map((g) => g.groupKey))
    for (const area of todasAsAreas) {
      if (comCurso.has(area.id)) continue
      fileiras.push({ key: area.id, areaName: area.name, areaSlug: area.slug, items: [] })
    }
  }

  return fileiras
}
```

Run: `npx vitest run src/server/vitrine-query.test.ts` — Expected: PASS.

- [ ] **Step 5: `getContinueWatching` devolve posição e totais**

Em `src/server/progress.ts`, importar `acaoDoCurso` de `@/lib/progress/proxima-aula`, e trocar o tipo de retorno e o final da função:

```ts
export async function getContinueWatching(): Promise<{
  courseSlug: string
  courseTitle: string
  lessonSlug: string
  lessonTitle: string
  /** Posição da aula a retomar, contando de 1 — o "Aula 2" de "Aula 2 de 3". */
  lessonNumber: number
  lessonCount: number
  completedCount: number
} | null> {
```

```ts
  const concluidas = await getCompletedLessonIds(course.id)
  // Mesma regra do banner do curso e da lista de episódios: a primeira não
  // concluída. Curso todo concluído não é "retomada".
  const acao = acaoDoCurso(course.lessons, concluidas)
  if (acao.tipo !== 'comecar' && acao.tipo !== 'continuar') return null
  const proxima = course.lessons[acao.indice]!

  return {
    courseSlug: course.slug,
    courseTitle: course.title,
    lessonSlug: proxima.slug,
    lessonTitle: proxima.title,
    lessonNumber: acao.indice + 1,
    lessonCount: course.lessons.length,
    completedCount: course.lessons.filter((l) => concluidas.has(l.id)).length,
  }
}
```

- [ ] **Step 6: Verificar**

Run: `npm run typecheck && npm run lint && npm test` — Expected: verde.
Run: `npx vitest run tests/db/progress.test.ts --config vitest.db.config.ts` — Expected: verde.

- [ ] **Step 7: Commit**

```bash
git add src/lib/progress/proxima-aula.ts src/lib/progress/proxima-aula.test.ts src/server/vitrine-query.ts src/server/vitrine-query.test.ts src/server/progress.ts
git commit -m "feat(vitrine): regras de proxima aula, filtros por progresso e fileiras por area"
```

---

### Task 3: Início — destaque, filtros, fileiras e card de curso

**Files:**
- Modify: `src/components/catalog/course-card.tsx`
- Create: `src/components/catalog/filtros-progresso.tsx`, `src/components/catalog/destaque-home.tsx`, `src/components/catalog/fileira-area.tsx`
- Modify: `src/app/(app)/page.tsx`
- Modify: `e2e/vitrine.spec.ts`
- Delete: `src/components/catalog/area-card.tsx`, `src/components/catalog/hero-banner.tsx`
- Modify: `src/server/vitrine-query.ts`, `src/server/vitrine-query.test.ts` (remover `montarVitrine`, `AreaVitrine`, `capaDoCurso`, `corDaAreaDoCurso` e seus `describe`)

**Interfaces:**
- Consumes (Task 2): `lerFiltro`, `montarFileiras`, `Fileira`, `FiltroProgresso`, `capaComReserva`, `itemDoCatalogo`, `escolherDestaque` (existente), `getContinueWatching` com `lessonNumber`, `lessonCount`, `completedCount`.
- Produces: `CourseCard({ item, className }: { item: CatalogItem; className?: string })` — renderiza um `<li>`; mantém o texto `"N aula(s)"` visível e `"Curso bloqueado"` em `sr-only` (usados por `e2e/acesso-bloqueado.spec.ts`).

- [ ] **Step 1: Card de curso**

Substituir `src/components/catalog/course-card.tsx` inteiro:

```tsx
import Link from 'next/link'
import { cn } from '@/lib/cn'
import type { CatalogItem } from '@/server/catalog'
import { capaComReserva } from '@/server/vitrine-query'

/**
 * Card de curso compartilhado pelas fileiras da home e pela grade da área
 * (spec 2026-09-29, seção 8.1). Sem vidro de propósito: a capa já é imagem,
 * e vidro sobre imagem é o "vidro em tudo" que a spec proíbe.
 */
export function CourseCard({ item, className }: { item: CatalogItem; className?: string }) {
  const bloqueado = item.access === 'none'
  const capa = capaComReserva(item)
  const comecou = !bloqueado && item.progress.completed > 0
  const percent = item.progress.percent

  return (
    <li className={className}>
      <Link
        href={`/curso/${item.slug}`}
        className="group block rounded-card focus:outline-none focus-visible:ring-2 focus-visible:ring-acao"
      >
        {/* Reserva final de capa (from-azul to-ciano): tokens fixos, iguais
            nos dois temas — sobre eles só vai o cadeado, nunca texto. */}
        <div
          className={cn(
            'relative aspect-[16/10] overflow-hidden rounded-card border border-vidro-borda',
            capa ? 'bg-capa-fundo' : 'bg-gradient-to-br from-azul to-ciano',
          )}
        >
          {capa && (
            // Capa é URL externa; next/image exigiria allowlist de domínio.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={capa}
              alt=""
              className={cn(
                'h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none',
                bloqueado && 'opacity-45 grayscale',
              )}
            />
          )}
          {bloqueado && (
            <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
              <span aria-hidden>🔒</span>
              <span className="sr-only">Curso bloqueado</span>
            </span>
          )}
          {comecou && (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
              <div className="h-full bg-gradient-to-r from-azul to-ciano" style={{ width: `${percent}%` }} />
            </div>
          )}
        </div>
        <h3 className="mt-2 line-clamp-2 text-sm font-semibold text-texto">{item.title}</h3>
        <p className="mt-0.5 text-xs text-texto-suave">
          {item.lessonCount} {item.lessonCount === 1 ? 'aula' : 'aulas'}
          {comecou && ` · ${percent}%`}
          {bloqueado && item.requestStatus === 'pending' && ' · acesso solicitado'}
        </p>
      </Link>
    </li>
  )
}
```

- [ ] **Step 2: Pílulas de filtro**

`src/components/catalog/filtros-progresso.tsx`:

```tsx
import Link from 'next/link'
import { cn } from '@/lib/cn'
import type { FiltroProgresso } from '@/server/vitrine-query'

const OPCOES: { valor: FiltroProgresso; rotulo: string }[] = [
  { valor: 'tudo', rotulo: 'Tudo' },
  { valor: 'continuar', rotulo: 'Continuar' },
  { valor: 'nao-iniciados', rotulo: 'Não iniciados' },
  { valor: 'concluidos', rotulo: 'Concluídos' },
]

/**
 * Links, não botões: o filtro vive na URL (spec, seção 9.2). Funciona sem
 * JavaScript, dá para mandar o link, e o voltar do navegador desfaz.
 */
export function FiltrosProgresso({ ativo }: { ativo: FiltroProgresso }) {
  return (
    <nav aria-label="Filtrar cursos" className="flex flex-wrap gap-2">
      {OPCOES.map(({ valor, rotulo }) => {
        const selecionado = valor === ativo
        return (
          <Link
            key={valor}
            href={valor === 'tudo' ? '/' : `/?filtro=${valor}`}
            aria-current={selecionado ? 'page' : undefined}
            className={cn(
              'rounded-full border px-4 py-1.5 text-sm transition-colors',
              selecionado
                ? 'border-selecionado-borda bg-selecionado font-medium text-selecionado-texto'
                : 'border-vidro-borda bg-vidro text-texto-suave hover:text-texto',
            )}
          >
            {rotulo}
          </Link>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 3: Card de destaque**

`src/components/catalog/destaque-home.tsx`:

```tsx
import Link from 'next/link'
import { ProgressBar } from '@/components/progress/progress-bar'
import { cn } from '@/lib/cn'

/**
 * O card de vidro "Continue de onde parou" (ou a trilha inicial). Um dos
 * quatro lugares onde a spec permite vidro (seção 4.2).
 */
export function DestaqueHome({
  rotulo,
  titulo,
  detalhe,
  capaUrl,
  concluidas,
  total,
  href,
  textoBotao,
}: {
  rotulo: string
  titulo: string
  detalhe: string
  capaUrl: string | null
  concluidas: number
  total: number
  href: string
  textoBotao: string
}) {
  return (
    <section
      aria-label={rotulo}
      className="flex flex-col gap-4 rounded-2xl border border-vidro-borda bg-vidro p-3 shadow-destaque backdrop-blur-md sm:flex-row sm:items-center sm:p-4"
    >
      <div
        className={cn(
          'aspect-[16/10] w-full shrink-0 overflow-hidden rounded-card sm:w-[44%]',
          capaUrl ? 'bg-capa-fundo' : 'bg-gradient-to-br from-azul to-ciano',
        )}
      >
        {capaUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={capaUrl} alt="" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="min-w-0 flex-1 px-1 pb-1">
        <p className="text-xs font-medium uppercase tracking-wider text-selecionado-texto">{rotulo}</p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-texto text-balance">{titulo}</h2>
        <p className="mt-0.5 text-sm text-texto-suave">{detalhe}</p>
        {total > 0 && (
          <div className="mt-3 max-w-md">
            <ProgressBar completed={concluidas} total={total} />
          </div>
        )}
        <Link
          href={href}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-acao px-5 py-2 text-sm font-semibold text-acao-texto transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-acao focus-visible:ring-offset-2 focus-visible:ring-offset-fundo"
        >
          <span aria-hidden>▶</span> {textoBotao}
        </Link>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Fileira de área**

`src/components/catalog/fileira-area.tsx`:

```tsx
import Link from 'next/link'
import { CourseCard } from '@/components/catalog/course-card'
import type { Fileira } from '@/server/vitrine-query'

// Largura do card: o próximo fica cortado na borda de propósito — é o sinal
// de que a fileira rola (risco "rolagem horizontal escondendo curso", spec 13).
const LARGURA = 'w-[72%] shrink-0 snap-start sm:w-[44%] lg:w-[calc((100%-2rem)/3.3)]'

export function FileiraArea({ fileira }: { fileira: Fileira }) {
  return (
    <section aria-labelledby={`fileira-${fileira.key}`}>
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 id={`fileira-${fileira.key}`} className="text-lg font-semibold tracking-tight text-texto">
          {fileira.areaName}
        </h2>
        <Link
          href={`/area/${fileira.areaSlug}`}
          aria-label={`Ver todos os cursos de ${fileira.areaName}`}
          className="shrink-0 text-sm text-texto-suave transition-colors hover:text-texto"
        >
          Ver tudo →
        </Link>
      </div>
      {/* -mx/px: a rolagem vai até a borda da tela no celular, sem a página
          ganhar rolagem horizontal (Review Focus 5). */}
      <ul className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:thin]">
        {fileira.items.length === 0 ? (
          <li className={LARGURA}>
            <div className="flex aspect-[16/10] items-center justify-center rounded-card border border-dashed border-vidro-borda bg-vidro text-sm text-texto-suave">
              Em breve
            </div>
          </li>
        ) : (
          fileira.items.map((item) => <CourseCard key={item.id} item={item} className={LARGURA} />)
        )}
      </ul>
    </section>
  )
}
```

- [ ] **Step 5: A página Início**

Substituir `src/app/(app)/page.tsx` inteiro:

```tsx
import { DestaqueHome } from '@/components/catalog/destaque-home'
import { FileiraArea } from '@/components/catalog/fileira-area'
import { FiltrosProgresso } from '@/components/catalog/filtros-progresso'
import { getCurrentUser } from '@/lib/auth/session'
import { listAreas } from '@/server/areas'
import { getCatalog } from '@/server/catalog'
import { getContinueWatching } from '@/server/progress'
import {
  capaComReserva,
  escolherDestaque,
  itemDoCatalogo,
  lerFiltro,
  montarFileiras,
} from '@/server/vitrine-query'

export const metadata = { title: 'Início — GEX Academy' }

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const filtro = lerFiltro((await searchParams).filtro)

  const [user, catalog, continuar, todasAsAreas] = await Promise.all([
    getCurrentUser(),
    getCatalog(),
    getContinueWatching(),
    // Áreas sem curso publicado não geram grupo no catálogo; listAreas()
    // completa as fileiras com elas ("Em breve"). Mesma consulta do admin,
    // legível por qualquer colaborador ativo (RLS areas_leitura).
    listAreas(),
  ])

  // escolherDestaque continua a autoridade: trilha pendente primeiro, depois
  // retomada. O filtro NÃO age no destaque (spec, seção 5).
  const destaque = escolherDestaque(catalog.onboarding, continuar !== null)
  const fileiras = montarFileiras(catalog, todasAsAreas, filtro)
  const primeiroNome = user!.fullName.split(' ')[0]

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-5">
        <h1 className="text-3xl font-semibold tracking-tight text-texto">Olá, {primeiroNome}</h1>
        <FiltrosProgresso ativo={filtro} />
      </header>

      {destaque.tipo === 'trilha' ? (
        <DestaqueHome
          rotulo="Comece por aqui"
          titulo={destaque.item.title}
          detalhe={`Trilha inicial · ${destaque.item.lessonCount} ${destaque.item.lessonCount === 1 ? 'aula' : 'aulas'}`}
          capaUrl={capaComReserva(destaque.item)}
          concluidas={destaque.item.progress.completed}
          total={destaque.item.progress.total}
          href={`/curso/${destaque.item.slug}`}
          textoBotao={destaque.item.progress.completed > 0 ? 'Continuar' : 'Começar'}
        />
      ) : destaque.tipo === 'retomada' && continuar ? (
        (() => {
          const item = itemDoCatalogo(catalog, continuar.courseSlug)
          return (
            <DestaqueHome
              rotulo="Continue de onde parou"
              titulo={continuar.courseTitle}
              detalhe={`Aula ${continuar.lessonNumber} de ${continuar.lessonCount} · ${continuar.lessonTitle}`}
              capaUrl={item ? capaComReserva(item) : null}
              concluidas={continuar.completedCount}
              total={continuar.lessonCount}
              href={`/curso/${continuar.courseSlug}/aula/${continuar.lessonSlug}`}
              textoBotao="Continuar"
            />
          )
        })()
      ) : null}

      {fileiras.length === 0 ? (
        <p className="text-sm text-texto-suave">
          {filtro === 'tudo'
            ? 'Nenhuma área cadastrada ainda. Assim que o administrador criar as áreas, elas aparecem aqui.'
            : 'Nenhum curso neste filtro.'}
        </p>
      ) : (
        fileiras.map((fileira) => <FileiraArea key={fileira.key} fileira={fileira} />)
      )}
    </div>
  )
}
```

- [ ] **Step 6: Remover o que ficou sem uso**

```bash
git rm src/components/catalog/area-card.tsx src/components/catalog/hero-banner.tsx
```

Em `src/server/vitrine-query.ts`, apagar `AreaVitrine`, `montarVitrine`, `capaDoCurso` e `corDaAreaDoCurso`; em `vitrine-query.test.ts`, apagar os `describe` dessas funções e seus nomes no import. Conferir:

Run: `grep -rn "montarVitrine\|AreaVitrine\|capaDoCurso\|corDaAreaDoCurso\|AreaCard\|HeroBanner" src e2e`
Expected: nenhuma ocorrência.

- [ ] **Step 7: Reescrever as afirmações da home em `e2e/vitrine.spec.ts`**

No primeiro teste, trocar o trecho que começa em `const capaMinha = page.locator('li').filter({ hasText: nomeAreaMinha })` até o `await expect(page).toHaveURL(`/area/${areaOutra.slug}`)` por:

```ts
    // Home em fileiras (spec 2026-09-29): uma seção por área, com os cursos
    // dela. O curso não tem capa própria — a reserva usa a capa da ÁREA
    // (spec, seção 9.4), então o <img> do card é a urlCapa.
    const fileiraMinha = page.getByRole('region', { name: nomeAreaMinha })
    await expect(fileiraMinha.getByRole('heading', { name: nomeAreaMinha })).toBeVisible()
    const cardMinha = fileiraMinha.locator('li').filter({ hasText: tituloCursoMinha })
    await expect(cardMinha.locator('img')).toHaveAttribute('src', urlCapa)
    await expect(cardMinha.getByText('Curso bloqueado')).toHaveCount(0)

    const fileiraOutra = page.getByRole('region', { name: nomeAreaOutra })
    await expect(fileiraOutra.locator('li').filter({ hasText: tituloCursoOutra }).getByText('Curso bloqueado')).toBeAttached()

    await fileiraMinha
      .getByRole('link', { name: `Ver todos os cursos de ${nomeAreaMinha}` })
      .click({ timeout: TIMEOUT_CLIQUE })
    await expect(page).toHaveURL(`/area/${areaMinha.slug}`)
    await expect(page.getByRole('heading', { name: tituloCursoMinha })).toBeVisible()

    await page
      .locator('li')
      .filter({ hasText: tituloCursoMinha })
      .getByRole('link')
      .click({ timeout: TIMEOUT_CLIQUE })
    await expect(page).toHaveURL(`/curso/${slugCursoMinha}`)
    await expect(page.getByRole('heading', { name: tituloCursoMinha })).toBeVisible()
    await expect(page.getByText(tituloAulaMinha)).toBeVisible()

    await page.goto('/')
    await page
      .getByRole('region', { name: nomeAreaOutra })
      .getByRole('link', { name: `Ver todos os cursos de ${nomeAreaOutra}` })
      .click({ timeout: TIMEOUT_CLIQUE })
    await expect(page).toHaveURL(`/area/${areaOutra.slug}`)
```

O `getByRole('region', { name })` funciona porque a `<section>` da fileira tem `aria-labelledby` apontando para o título.

- [ ] **Step 8: Verificar**

Run: `npm run typecheck && npm run lint && npm test && npm run build` — Expected: verde.
Run: `npx playwright test e2e/vitrine.spec.ts` — Expected: PASS (2 testes).
Run: `npx playwright test e2e/acesso-bloqueado.spec.ts` — Expected: PASS.
Run: `CAPTURAS=1 npx playwright test e2e/capturas.spec.ts` — Expected: PASS. **Olhar** `inicio-*` e `inicio-filtro-*`, nos dois temas e tamanhos: destaque em vidro, pílula ativa com contorno, fileiras com o card seguinte cortado na borda.
Run: `node scripts/limpar-dados-de-teste.mjs` — Expected: 0 fixtures.

- [ ] **Step 9: Commit**

```bash
git add -A src/components/catalog src/app/\(app\)/page.tsx src/server/vitrine-query.ts src/server/vitrine-query.test.ts e2e/vitrine.spec.ts
git commit -m "feat(inicio): destaque em vidro, filtros por progresso e fileiras por area"
```

(Nunca `git add -A` na raiz: `.agents/`, `.claude/` e `skills-lock.json` não entram no repositório.)

---

### Task 4: Página da área

**Files:**
- Modify: `src/app/(app)/area/[slug]/page.tsx`
- Modify: `src/server/vitrine-query.ts`, `src/server/vitrine-query.test.ts` (remover `selecionarEmAndamento`)

**Interfaces:**
- Consumes: `CourseCard` (Task 3), `dadosDaArea` (existente), `Voltar` (existente).

- [ ] **Step 1: Banner e grade**

Na página, remover o import e o uso de `selecionarEmAndamento` e a `<section>` "Continue de onde parou" inteira (o destaque da home cumpre esse papel; a spec, seção 6, não a inclui). Trocar a `<section>` do banner por:

```tsx
      <section
        className={`relative overflow-hidden rounded-2xl border border-vidro-borda ${
          semReserva ? 'bg-gradient-to-br from-azul to-ciano' : 'bg-capa-fundo'
        }`}
        style={corDaArea && !capaDaArea ? { backgroundColor: corDaArea } : undefined}
      >
        {capaDaArea && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={capaDaArea} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
        {/* Mesmo overlay e mesma medição de contraste de antes (ver o
            comentário original, preservado acima desta seção). */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/88 via-black/50 to-black/20" />
        <div className="relative flex min-h-48 flex-col justify-end p-6 sm:min-h-56 sm:p-8">
          <h1 className="text-3xl font-semibold tracking-tight text-white">{nome}</h1>
          <p className="mt-1 text-sm text-white/75">
            {itens.length === 0
              ? 'Nenhum curso ainda'
              : `${itens.length} ${itens.length === 1 ? 'curso' : 'cursos'}`}
          </p>
        </div>
      </section>
```

Manter o comentário longo sobre o overlay e o degrau 3 acima da `<section>`. Na seção "Todos os cursos", o título vira `text-lg font-semibold tracking-tight text-texto` (sem caixa-alta) com o texto "Cursos", e a grade vira `grid gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3`.

- [ ] **Step 2: Remover `selecionarEmAndamento`**

Run: `grep -rn "selecionarEmAndamento" src` — se só restarem a definição e o teste, apagar os dois.

- [ ] **Step 3: Verificar**

Run: `npm run typecheck && npm run lint && npm test` — Expected: verde.
Run: `npx playwright test e2e/vitrine.spec.ts` — Expected: PASS.
Run: `CAPTURAS=1 npx playwright test e2e/capturas.spec.ts` — Expected: PASS. **Olhar** `area-*`.
Run: `node scripts/limpar-dados-de-teste.mjs` — Expected: 0 fixtures.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/area/\[slug\]/page.tsx src/server/vitrine-query.ts src/server/vitrine-query.test.ts
git commit -m "feat(area): banner maior e grade com o card de curso compartilhado"
```

---

### Task 5: Página do curso — banner, próxima aula e lista de episódios

**Files:**
- Modify: `src/server/viewer-query.ts`, `src/server/viewer-query.test.ts`
- Modify: `src/components/progress/progress-bar.tsx`
- Create: `src/components/layout/voltar-circular.tsx`, `src/components/curso/banner-curso.tsx`, `src/components/curso/lista-de-episodios.tsx`
- Modify: `src/components/catalog/locked-course.tsx`
- Modify: `src/app/(app)/curso/[slug]/page.tsx`

**Interfaces:**
- Consumes (Task 2): `acaoDoCurso`, `estadoDasAulas`, `EstadoDaAula`; `capaComReserva`.
- Produces: `CourseView.areaCoverUrl: string | null`.
- Produces: `ProgressBar({ completed, total, tom }: { completed: number; total: number; tom?: 'padrao' | 'sobre-imagem' })`.
- Produces: `ListaDeEpisodios({ courseSlug, aulas, estados, capaUrl, aulaAtualId, compacta }: { courseSlug: string; aulas: CourseView['lessons']; estados: EstadoDaAula[]; capaUrl: string | null; aulaAtualId?: string; compacta?: boolean })` — reusada na Task 6.
- Produces: `VoltarCircular({ href, rotulo }: { href: string; rotulo: string })`.

- [ ] **Step 1: `areaCoverUrl` no curso (teste falha)**

Em `src/server/viewer-query.test.ts`: na fixture, `areas: { name: 'Tráfego', slug: 'trafego', color: '#2f6bff' }` ganha `cover_url: 'https://exemplo.test/area.png'`; a lista esperada de chaves do teste "CourseView nunca carrega campo de vídeo ou anexo" ganha `'areaCoverUrl'`; e a expectativa completa do teste de acesso "none" ganha `areaCoverUrl: 'https://exemplo.test/area.png'`.

Run: `npx vitest run src/server/viewer-query.test.ts` — Expected: FAIL.

- [ ] **Step 2: Implementar**

Em `src/server/viewer-query.ts`: `SELECT_CURSO_VIEW` passa a pedir `areas(name, slug, color, cover_url)`; o tipo da linha ganha `cover_url: string | null` dentro de `areas`; `CourseView` ganha, logo após `areaColor`:

```ts
  /** Capa da ÁREA — reserva quando o curso não tem capa própria (spec 2026-09-29, seção 9.4). */
  areaCoverUrl: string | null
```

e `paraCourseView` preenche `areaCoverUrl: row.areas?.cover_url ?? null`.

Run: `npx vitest run src/server/viewer-query.test.ts` — Expected: PASS.
Run: `npx vitest run tests/db/viewer.test.ts --config vitest.db.config.ts` — Expected: PASS.

- [ ] **Step 3: Tom "sobre imagem" na barra de progresso**

O banner do curso é escuro nos dois temas (imagem + overlay preto), e `text-texto-suave` no tema claro some ali. Em `progress-bar.tsx`:

```tsx
import { cn } from '@/lib/cn'
import { progressPercent } from '@/lib/progress/percent'

export function ProgressBar({
  completed,
  total,
  tom = 'padrao',
}: {
  completed: number
  total: number
  /** 'sobre-imagem': texto e trilho claros, para usar em cima de capa escurecida — em qualquer tema. */
  tom?: 'padrao' | 'sobre-imagem'
}) {
```

O trilho passa a `cn('h-1.5 w-full overflow-hidden rounded-full', tom === 'sobre-imagem' ? 'bg-white/20' : 'bg-borda')` e o `<p>`, `cn('mt-1 text-xs', tom === 'sobre-imagem' ? 'text-white/75' : 'text-texto-suave')`. O texto continua igual.

- [ ] **Step 4: Voltar circular**

`src/components/layout/voltar-circular.tsx`:

```tsx
import Link from 'next/link'

/** O botão voltar da página do curso (spec, seção 7): círculo no canto, com o destino no rótulo acessível. */
export function VoltarCircular({ href, rotulo }: { href: string; rotulo: string }) {
  return (
    <Link
      href={href}
      aria-label={`Voltar para ${rotulo}`}
      title={`Voltar para ${rotulo}`}
      className="inline-grid h-10 w-10 place-items-center rounded-full border border-vidro-borda bg-vidro text-texto-suave backdrop-blur-md transition-colors hover:text-texto focus:outline-none focus-visible:ring-2 focus-visible:ring-acao"
    >
      <span aria-hidden className="text-lg leading-none">‹</span>
    </Link>
  )
}
```

- [ ] **Step 5: Banner do curso**

`src/components/curso/banner-curso.tsx`:

```tsx
import Link from 'next/link'
import { ProgressBar } from '@/components/progress/progress-bar'
import { cn } from '@/lib/cn'

export function BannerCurso({
  rotulo,
  titulo,
  descricao,
  capaUrl,
  concluidas,
  total,
  acao,
}: {
  rotulo: string
  titulo: string
  descricao: string | null
  capaUrl: string | null
  concluidas: number
  total: number
  acao: { href: string; texto: string } | null
}) {
  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-2xl border border-vidro-borda',
        capaUrl ? 'bg-capa-fundo' : 'bg-gradient-to-br from-azul to-ciano',
      )}
    >
      {capaUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={capaUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}
      {/* Escurece da esquerda (onde está o texto) para a direita, e de baixo
          para cima — o texto branco lê em cima de qualquer capa. */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/65 to-black/10" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
      <div className="relative flex min-h-72 max-w-2xl flex-col justify-end gap-2 p-6 sm:min-h-80 sm:p-8">
        <p className="text-xs font-medium uppercase tracking-wider text-white/75">{rotulo}</p>
        <h1 className="text-3xl font-semibold tracking-tight text-white text-balance sm:text-4xl">{titulo}</h1>
        {descricao && <p className="text-sm text-white/80 line-clamp-3">{descricao}</p>}
        {total > 0 && (
          <div className="mt-1 max-w-sm">
            <ProgressBar completed={concluidas} total={total} tom="sobre-imagem" />
          </div>
        )}
        {acao && (
          <Link
            href={acao.href}
            className="mt-3 inline-flex w-fit items-center gap-2 rounded-full bg-acao px-5 py-2.5 text-sm font-semibold text-acao-texto transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <span aria-hidden>▶</span> {acao.texto}
          </Link>
        )}
      </div>
    </section>
  )
}
```

- [ ] **Step 6: Lista de episódios**

`src/components/curso/lista-de-episodios.tsx`:

```tsx
import Link from 'next/link'
import { cn } from '@/lib/cn'
import { formatDuration } from '@/lib/format'
import type { EstadoDaAula } from '@/lib/progress/proxima-aula'
import type { CourseView } from '@/server/viewer'

const SELO: Record<EstadoDaAula, { texto: string; classe: string }> = {
  concluida: { texto: 'Concluída', classe: 'border-sucesso/40 text-sucesso' },
  assistindo: { texto: 'Assistindo', classe: 'border-selecionado-borda bg-selecionado text-selecionado-texto' },
  'nao-iniciada': { texto: 'Não iniciada', classe: 'border-vidro-borda text-texto-suave' },
}

/**
 * Aulas do curso como lista de episódios (spec, seção 7). A versão
 * `compacta` (sem miniatura nem selo) é a lista lateral da sala de aula.
 * O destaque é da `aulaAtualId` quando informada (sala de aula: a aula aberta);
 * senão, da aula no estado "assistindo" (página do curso: a próxima).
 */
export function ListaDeEpisodios({
  courseSlug,
  aulas,
  estados,
  capaUrl,
  aulaAtualId,
  compacta = false,
}: {
  courseSlug: string
  aulas: CourseView['lessons']
  estados: EstadoDaAula[]
  capaUrl: string | null
  aulaAtualId?: string
  compacta?: boolean
}) {
  if (aulas.length === 0) {
    return <p className="p-4 text-center text-sm text-texto-suave">Este curso ainda não tem aulas publicadas.</p>
  }

  return (
    <ol className="divide-y divide-vidro-borda">
      {aulas.map((aula, i) => {
        const estado = estados[i]!
        const atual = aulaAtualId ? aula.id === aulaAtualId : estado === 'assistindo'
        return (
          <li key={aula.id}>
            <Link
              href={`/curso/${courseSlug}/aula/${aula.slug}`}
              aria-current={atual ? 'true' : undefined}
              className={cn(
                'flex items-center gap-3 transition-colors hover:bg-vidro',
                compacta ? 'px-4 py-2.5' : 'px-4 py-3',
                atual && 'bg-selecionado shadow-[inset_2px_0_0_var(--color-ciano)]',
              )}
            >
              <span className="w-6 shrink-0 text-sm tabular-nums text-texto-suave">{i + 1}</span>
              {!compacta && (
                <div
                  className={cn(
                    'hidden aspect-video w-24 shrink-0 overflow-hidden rounded-md sm:block',
                    capaUrl ? 'bg-capa-fundo' : 'bg-gradient-to-br from-azul to-ciano',
                  )}
                >
                  {capaUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={capaUrl} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className={cn('truncate text-sm', atual ? 'font-semibold text-texto' : 'text-texto')}>{aula.title}</p>
                {aula.durationSeconds ? (
                  <p className="text-xs text-texto-suave">{formatDuration(aula.durationSeconds)}</p>
                ) : null}
              </div>
              {compacta ? (
                estado === 'concluida' && (
                  <span className="text-sm text-sucesso">
                    <span aria-hidden>✓</span>
                    <span className="sr-only">Concluída</span>
                  </span>
                )
              ) : (
                <span className={cn('shrink-0 rounded-full border px-2.5 py-0.5 text-xs', SELO[estado].classe)}>
                  {SELO[estado].texto}
                </span>
              )}
            </Link>
          </li>
        )
      })}
    </ol>
  )
}
```

- [ ] **Step 7: A página do curso**

Substituir o `return` (a partir de `const concluidas = ...`) de `src/app/(app)/curso/[slug]/page.tsx`, e ajustar os imports (sai `Link`, `Voltar`, `ProgressBar`, `formatDuration`; entram `VoltarCircular`, `BannerCurso`, `ListaDeEpisodios`, `acaoDoCurso`, `estadoDasAulas`, `capaComReserva`):

```tsx
  const concluidas = await getCompletedLessonIds(course.id)
  const acao = acaoDoCurso(course.lessons, concluidas)
  const estados = estadoDasAulas(course.lessons, concluidas)
  const concluidasNoCurso = course.lessons.filter((l) => concluidas.has(l.id)).length
  const capa = capaComReserva({ coverUrl: course.coverUrl, areaCoverUrl: course.areaCoverUrl })
  const totalSegundos = course.lessons.reduce((soma, l) => soma + (l.durationSeconds ?? 0), 0)

  const botao =
    acao.tipo === 'nenhuma'
      ? null
      : {
          href: `/curso/${course.slug}/aula/${course.lessons[acao.indice]!.slug}`,
          texto:
            acao.tipo === 'comecar' ? 'Começar' : acao.tipo === 'continuar' ? `Continuar aula ${acao.indice + 1}` : 'Rever curso',
        }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <VoltarCircular href={course.areaSlug ? `/area/${course.areaSlug}` : '/'} rotulo={course.areaName ?? 'Início'} />

      <BannerCurso
        rotulo={`${course.areaName ?? 'Trilha inicial'} · ${course.lessons.length} ${course.lessons.length === 1 ? 'aula' : 'aulas'}`}
        titulo={course.title}
        descricao={course.description}
        capaUrl={capa}
        concluidas={concluidasNoCurso}
        total={course.lessons.length}
        acao={botao}
      />

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-texto">Aulas</h2>
          {totalSegundos > 0 && <span className="text-sm text-texto-suave">{formatDuration(totalSegundos)}</span>}
        </div>
        <div className="overflow-hidden rounded-2xl border border-vidro-borda bg-vidro backdrop-blur-md">
          <ListaDeEpisodios courseSlug={course.slug} aulas={course.lessons} estados={estados} capaUrl={capa} />
        </div>
      </section>
    </div>
  )
```

(Mantém o import de `formatDuration` — é usado no total.)

- [ ] **Step 8: Curso bloqueado com a pele nova**

Em `src/components/catalog/locked-course.tsx`, o cartão `rounded-card border border-borda bg-superficie p-8` vira `rounded-2xl border border-vidro-borda bg-vidro p-8 backdrop-blur-md`. A capa passa a usar `capaComReserva({ coverUrl: course.coverUrl, areaCoverUrl: course.areaCoverUrl })` em vez de `course.coverUrl`. Nenhum texto muda — `'Você ainda não tem acesso a este curso.'` é procurado por dois specs.

- [ ] **Step 9: Verificar**

Run: `npm run typecheck && npm run lint && npm test && npm run build` — Expected: verde.
Run: `npx playwright test e2e/acesso-bloqueado.spec.ts` e `npx playwright test e2e/solicitacao-de-acesso.spec.ts` — Expected: PASS.
Run: `CAPTURAS=1 npx playwright test e2e/capturas.spec.ts` — Expected: PASS. **Olhar** `curso-*`: botão circular, banner legível nos dois temas, selo "Assistindo" com contorno.
Run: `node scripts/limpar-dados-de-teste.mjs` — Expected: 0 fixtures.

- [ ] **Step 10: Commit**

```bash
git add src/server/viewer-query.ts src/server/viewer-query.test.ts src/components/progress/progress-bar.tsx src/components/layout/voltar-circular.tsx src/components/curso src/components/catalog/locked-course.tsx src/app/\(app\)/curso/\[slug\]/page.tsx
git commit -m "feat(curso): banner com proxima aula e lista de episodios"
```

---

### Task 6: Página da aula — sala de aula e abas

**Files:**
- Create: `src/lib/aula/abas.ts`, `src/lib/aula/abas.test.ts`
- Create: `src/components/aula/abas-da-aula.tsx`, `src/components/aula/abas-da-aula.test.tsx`
- Modify: `src/server/viewer-query.ts`, `src/server/viewer.ts` (`indice` em `LessonView`)
- Modify: `src/app/(app)/curso/[slug]/aula/[lessonSlug]/page.tsx`
- Modify: `src/app/(manage)/gerenciar/duvidas/page.tsx`
- Modify: `e2e/forum-e-progresso.spec.ts`

**Interfaces:**
- Consumes: `ListaDeEpisodios` (Task 5), `estadoDasAulas` (Task 2), `capaComReserva` (Task 2).
- Produces: `type AbaDaAula = 'sobre' | 'materiais' | 'duvidas'`, `lerAba(valor: string | string[] | undefined): AbaDaAula`.
- Produces: `AbasDaAula({ abas, inicial }: { abas: { id: AbaDaAula; rotulo: string; conteudo: React.ReactNode }[]; inicial: AbaDaAula })`.
- Produces: `LessonView.indice: number` (0-based).

- [ ] **Step 1: Aba inicial (teste falha)**

`src/lib/aula/abas.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { lerAba } from './abas'

describe('lerAba', () => {
  it('reconhece as três abas', () => {
    expect(lerAba('sobre')).toBe('sobre')
    expect(lerAba('materiais')).toBe('materiais')
    expect(lerAba('duvidas')).toBe('duvidas')
  })
  // Review Focus 2.
  it('ausente, desconhecida ou repetida → sobre', () => {
    expect(lerAba(undefined)).toBe('sobre')
    expect(lerAba('qualquer')).toBe('sobre')
    expect(lerAba(['duvidas', 'sobre'])).toBe('sobre')
  })
})
```

Run: `npx vitest run src/lib/aula/abas.test.ts` — Expected: FAIL.

- [ ] **Step 2: Implementar `abas.ts`**

```ts
/**
 * A aba que a sala de aula abre, lida da URL (`?aba=`). Mora fora do
 * componente de abas de propósito: aquele é client component, e o servidor
 * não pode chamar função exportada de um módulo 'use client'.
 */
export type AbaDaAula = 'sobre' | 'materiais' | 'duvidas'

const ABAS: readonly AbaDaAula[] = ['sobre', 'materiais', 'duvidas']

export function lerAba(valor: string | string[] | undefined): AbaDaAula {
  return typeof valor === 'string' && (ABAS as readonly string[]).includes(valor) ? (valor as AbaDaAula) : 'sobre'
}
```

Run: `npx vitest run src/lib/aula/abas.test.ts` — Expected: PASS.

- [ ] **Step 3: Componente de abas (teste falha)**

`src/components/aula/abas-da-aula.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { AbasDaAula } from './abas-da-aula'

afterEach(cleanup)

const abas = [
  { id: 'sobre' as const, rotulo: 'Sobre', conteudo: <p>descrição</p> },
  { id: 'materiais' as const, rotulo: 'Materiais · 2', conteudo: <p>anexos</p> },
  { id: 'duvidas' as const, rotulo: 'Dúvidas · 1', conteudo: <p>fórum</p> },
]

describe('AbasDaAula', () => {
  it('abre na aba inicial e esconde as outras', () => {
    render(<AbasDaAula abas={abas} inicial="duvidas" />)
    expect(screen.getByRole('tab', { name: 'Dúvidas · 1' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('fórum')).toBeVisible()
    expect(screen.getByText('descrição')).not.toBeVisible()
  })

  it('clicar troca a aba', async () => {
    render(<AbasDaAula abas={abas} inicial="sobre" />)
    await userEvent.click(screen.getByRole('tab', { name: 'Materiais · 2' }))
    expect(screen.getByText('anexos')).toBeVisible()
    expect(screen.getByText('descrição')).not.toBeVisible()
  })

  it('setas do teclado andam entre as abas, e o foco vai junto', async () => {
    render(<AbasDaAula abas={abas} inicial="sobre" />)
    screen.getByRole('tab', { name: 'Sobre' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Materiais · 2' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'Materiais · 2' })).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Dúvidas · 1' })).toHaveFocus()
  })

  it('só a aba ativa fica na ordem do Tab', () => {
    render(<AbasDaAula abas={abas} inicial="sobre" />)
    expect(screen.getByRole('tab', { name: 'Sobre' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('tab', { name: 'Materiais · 2' })).toHaveAttribute('tabindex', '-1')
  })
})
```

Run: `npx vitest run src/components/aula/abas-da-aula.test.tsx` — Expected: FAIL (módulo inexistente). `toBeVisible` e `toHaveFocus` vêm do `@testing-library/jest-dom`, que `vitest.setup.ts` já carrega.

- [ ] **Step 4: Implementar `abas-da-aula.tsx`**

```tsx
'use client'

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import type { AbaDaAula } from '@/lib/aula/abas'

/**
 * Abas acessíveis da sala de aula (padrão WAI-ARIA de tabs, ativação
 * automática). Todo conteúdo vem renderizado do servidor; a aba só alterna
 * o que está visível — painéis inativos ficam `hidden`, não desmontados,
 * para o formulário do fórum não perder o que foi digitado ao trocar de aba.
 */
export function AbasDaAula({
  abas,
  inicial,
}: {
  abas: { id: AbaDaAula; rotulo: string; conteudo: ReactNode }[]
  inicial: AbaDaAula
}) {
  const [ativa, setAtiva] = useState<AbaDaAula>(inicial)
  const base = useId()
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  function aoTeclar(e: KeyboardEvent, i: number) {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    const destino = e.key === 'Home' ? 0 : e.key === 'End' ? abas.length - 1 : delta ? (i + delta + abas.length) % abas.length : -1
    if (destino === -1) return
    e.preventDefault()
    setAtiva(abas[destino]!.id)
    refs.current[destino]?.focus()
  }

  return (
    <div>
      <div role="tablist" aria-label="Conteúdo da aula" className="flex flex-wrap gap-2">
        {abas.map((aba, i) => {
          const selecionada = aba.id === ativa
          return (
            <button
              key={aba.id}
              ref={(el) => {
                refs.current[i] = el
              }}
              type="button"
              role="tab"
              id={`${base}-aba-${aba.id}`}
              aria-selected={selecionada}
              aria-controls={`${base}-painel-${aba.id}`}
              tabIndex={selecionada ? 0 : -1}
              onClick={() => setAtiva(aba.id)}
              onKeyDown={(e) => aoTeclar(e, i)}
              className={cn(
                'rounded-full border px-4 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-acao',
                selecionada
                  ? 'border-selecionado-borda bg-selecionado font-medium text-selecionado-texto'
                  : 'border-vidro-borda bg-vidro text-texto-suave hover:text-texto',
              )}
            >
              {aba.rotulo}
            </button>
          )
        })}
      </div>
      {abas.map((aba) => (
        <div
          key={aba.id}
          role="tabpanel"
          id={`${base}-painel-${aba.id}`}
          aria-labelledby={`${base}-aba-${aba.id}`}
          hidden={aba.id !== ativa}
          className="pt-5"
        >
          {aba.conteudo}
        </div>
      ))}
    </div>
  )
}
```

Run: `npx vitest run src/components/aula/abas-da-aula.test.tsx` — Expected: PASS.

- [ ] **Step 5: `indice` em `LessonView`**

Em `src/server/viewer-query.ts`, `LessonView` ganha `/** Posição da aula no curso, 0-based. */ indice: number`. Em `src/server/viewer.ts`, no objeto que `getLessonView` devolve, acrescentar `indice: navegacao.indice`.

Run: `npm run typecheck` — Expected: verde.

- [ ] **Step 6: A sala de aula**

Substituir `src/app/(app)/curso/[slug]/aula/[lessonSlug]/page.tsx` inteiro:

```tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AbasDaAula } from '@/components/aula/abas-da-aula'
import { ListaDeEpisodios } from '@/components/curso/lista-de-episodios'
import { ForumSection } from '@/components/forum/forum-section'
import { Voltar } from '@/components/layout/voltar'
import { CompleteButton } from '@/components/progress/complete-button'
import { ProgressBar } from '@/components/progress/progress-bar'
import { VideoPlayer } from '@/components/video/video-player'
import { lerAba } from '@/lib/aula/abas'
import { formatDuration } from '@/lib/format'
import { estadoDasAulas } from '@/lib/progress/proxima-aula'
import { listAttachments } from '@/server/attachments'
import { listQuestions } from '@/server/forum'
import { getCompletedLessonIds } from '@/server/progress'
import { getLessonView } from '@/server/viewer'
import { capaComReserva } from '@/server/vitrine-query'

function formatarTamanho(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default async function AulaPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; lessonSlug: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { slug, lessonSlug } = await params
  const abaInicial = lerAba((await searchParams).aba)
  const view = await getLessonView(slug, lessonSlug)
  if (!view) notFound()

  const { course, lesson, proxima, indice } = view
  const [attachments, concluidas, questions] = await Promise.all([
    listAttachments(lesson.id),
    getCompletedLessonIds(course.id),
    listQuestions(lesson.id),
  ])
  const estados = estadoDasAulas(course.lessons, concluidas)
  const concluidasNoCurso = course.lessons.filter((l) => concluidas.has(l.id)).length
  const duracao = course.lessons[indice]?.durationSeconds ?? null

  const sobre = lesson.description ? (
    // Texto puro: whitespace-pre-line preserva as quebras sem interpretar marcação.
    <p className="whitespace-pre-line text-sm leading-relaxed text-texto-suave">{lesson.description}</p>
  ) : (
    <p className="text-sm text-texto-suave">Esta aula não tem descrição.</p>
  )

  const materiais =
    attachments.length === 0 ? (
      <p className="text-sm text-texto-suave">Esta aula não tem material de apoio.</p>
    ) : (
      <ul className="divide-y divide-vidro-borda overflow-hidden rounded-2xl border border-vidro-borda bg-vidro">
        {attachments.map((anexo) => (
          <li key={anexo.id} className="flex items-center gap-3 px-4 py-3">
            <a href={`/api/anexos/${anexo.id}`} className="flex-1 truncate text-sm text-marca-600 hover:underline">
              {anexo.fileName}
            </a>
            <span className="text-xs text-texto-suave">{formatarTamanho(anexo.sizeBytes)}</span>
          </li>
        ))}
      </ul>
    )

  return (
    <div className="flex flex-col gap-4">
      <Voltar href={`/curso/${course.slug}`}>{course.title}</Voltar>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <div className="overflow-hidden rounded-2xl border border-vidro-borda">
            <VideoPlayer provider={lesson.provider} videoRef={lesson.ref} title={lesson.title} />
          </div>

          <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-texto text-balance">{lesson.title}</h1>
              <p className="mt-1 text-sm text-texto-suave">
                Aula {indice + 1} de {course.lessons.length}
                {duracao ? ` · ${formatDuration(duracao)}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <CompleteButton lessonId={lesson.id} courseSlug={course.slug} completed={concluidas.has(lesson.id)} />
              {proxima && (
                <Link
                  href={`/curso/${course.slug}/aula/${proxima}`}
                  className="inline-flex items-center rounded-full bg-acao px-4 py-2 text-sm font-semibold text-acao-texto transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-acao"
                >
                  Próxima ›
                </Link>
              )}
            </div>
          </div>

          <div className="mt-6">
            <AbasDaAula
              inicial={abaInicial}
              abas={[
                { id: 'sobre', rotulo: 'Sobre', conteudo: sobre },
                { id: 'materiais', rotulo: `Materiais · ${attachments.length}`, conteudo: materiais },
                {
                  id: 'duvidas',
                  rotulo: `Dúvidas · ${questions.length}`,
                  conteudo: <ForumSection lessonId={lesson.id} questions={questions} />,
                },
              ]}
            />
          </div>
        </div>

        <aside className="self-start overflow-hidden rounded-2xl border border-vidro-borda bg-vidro backdrop-blur-md lg:sticky lg:top-24">
          <div className="border-b border-vidro-borda px-4 py-3">
            <p className="text-sm font-semibold text-texto">Aulas do curso</p>
            <div className="mt-2">
              <ProgressBar completed={concluidasNoCurso} total={course.lessons.length} />
            </div>
          </div>
          <ListaDeEpisodios
            courseSlug={course.slug}
            aulas={course.lessons}
            estados={estados}
            capaUrl={capaComReserva({ coverUrl: course.coverUrl, areaCoverUrl: course.areaCoverUrl })}
            aulaAtualId={lesson.id}
            compacta
          />
        </aside>
      </div>
    </div>
  )
}
```

A página deixa de usar `anterior`: a lista lateral cobre ir para qualquer aula.

- [ ] **Step 7: O link da fila de dúvidas abre a aba Dúvidas**

Em `src/app/(manage)/gerenciar/duvidas/page.tsx`, o `href` do link "Abrir a aula e responder →" vira:

```tsx
                href={`/curso/${question.courseSlug}/aula/${question.lessonSlug}?aba=duvidas`}
```

Sem isso o líder cairia na aba "Sobre", sem ver a pergunta que veio responder. É a única edição em tela de gestão deste plano.

- [ ] **Step 8: Fórum dentro da aba em `e2e/forum-e-progresso.spec.ts`**

Toda navegação do spec para a página da aula que depois usa o fórum (`getByPlaceholder('Ficou com alguma dúvida nesta aula?')`, `'Enviar dúvida'`, `'Responder'`, ou procura o texto de uma pergunta/resposta) passa a ir para `.../aula/objetivo?aba=duvidas`. A primeira:

```ts
    await page.goto(`/curso/${slugCurso}/aula/objetivo?aba=duvidas`)
```

O líder chega pelo link "Abrir a aula e responder →", que já leva `?aba=duvidas` (Step 7) — não mudar esse clique: ele é a prova de que o link funciona. Conferir com `grep -n "aula/objetivo" e2e/forum-e-progresso.spec.ts` que nenhuma ida à aula seguida de uso do fórum ficou sem o parâmetro.

- [ ] **Step 9: Verificar**

Run: `npm run typecheck && npm run lint && npm test && npm run build` — Expected: verde.
Run: `npx playwright test e2e/forum-e-progresso.spec.ts` — Expected: PASS.
Run: `npx vitest run tests/db/viewer.test.ts tests/db/forum.test.ts --config vitest.db.config.ts` — Expected: PASS.
Run: `CAPTURAS=1 npx playwright test e2e/capturas.spec.ts` — Expected: PASS. **Olhar** `aula-*`: duas colunas no desktop, lista abaixo do vídeo no celular, aba ativa com contorno.
Run: `node scripts/limpar-dados-de-teste.mjs` — Expected: 0 fixtures.

- [ ] **Step 10: Commit**

```bash
git add src/lib/aula src/components/aula src/server/viewer-query.ts src/server/viewer.ts src/app/\(app\)/curso/\[slug\]/aula src/app/\(manage\)/gerenciar/duvidas/page.tsx e2e/forum-e-progresso.spec.ts
git commit -m "feat(aula): sala de aula com lista lateral e abas Sobre, Materiais e Duvidas"
```

---

### Task 7: Atualizar o CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

O `CLAUDE.md` hoje só importa o `AGENTS.md` — e o `AGENTS.md` é **reescrito pelo `next dev`** (ver o próprio arquivo), então conhecimento do projeto não pode morar nele. Mora no `CLAUDE.md`, mantendo o import na primeira linha.

- [ ] **Step 1: Escrever o CLAUDE.md**

```markdown
@AGENTS.md

# GEX Academy

Plataforma interna de treinamento da GEX Corp: cada líder de área publica cursos para os colaboradores, e quem é novo começa pela trilha inicial. Acesso só por convite.

- **Produção:** https://academy.gexmain.com — Vercel, projeto `academy-gexmain` (time Gex). **Push na `main` publica sozinho.**
- **Banco, login e arquivos:** Supabase, projeto **Gex Academy** — o único que pode ser tocado. A conta da empresa tem outros projetos; nenhum deles.
- **E-mail:** Resend (`nao-responda@academy.gexmain.com`); o SMTP do Supabase Auth aponta para ele.
- Situação atual e pendências: `ONDE-PARAMOS.md`. Instalação: `README.md`. Especificações e planos: `docs/superpowers/`.

## Nunca

- **`npm run db:reset`** — apaga e recria o banco, que é o de **produção**. Migration nova: `npm run db:push` (só acrescenta).
- **`npm run test:e2e` inteiro** — `e2e/primeiro-acesso.spec.ts` manda convite por e-mail de verdade. E2E só spec a spec: `npx playwright test e2e/<arquivo>.spec.ts`.
- **`npm run db:types`** — exige runtime de container que esta máquina não tem. `src/lib/supabase/database.types.ts` é mantido à mão: tabela nova, tipo novo junto.
- **Credenciais em arquivo, memória ou conversa.** Ficam só no `.env.local` (fora do git) e nas variáveis da Vercel.
- **`git add -A` na raiz.** `.agents/`, `.claude/` e `skills-lock.json` são locais e não entram no repositório.

## Comandos

| | |
|---|---|
| `npm run dev` | servidor local em http://localhost:3000 (usa o Supabase real) |
| `npm run typecheck` / `npm run lint` | tipos e lint |
| `npm test` | unitários (Vitest) |
| `npm run test:db` | testes de banco, contra o Supabase **real** |
| `npx playwright test e2e/<arquivo>.spec.ts` | um spec E2E |
| `CAPTURAS=1 npx playwright test e2e/capturas.spec.ts` | capturas das telas do aluno, dois temas, desktop e celular, em `test-results/capturas/` |
| `node scripts/limpar-dados-de-teste.mjs` | lista fixtures de teste que sobraram (`--apagar` apaga) |
| `node scripts/limpar-capas-orfas.mjs` | lista capas sem área/curso no Storage (`--apagar` apaga) |

A CI (`.github/workflows/verificacao.yml`) roda tipos, lint, unitários e build a cada push. Ela **não** trava o deploy: a Vercel publica mesmo com teste vermelho.

## Convenções

- **Esta versão do Next é diferente da conhecida.** Antes de usar API do Next, ler `node_modules/next/dist/docs/`. Exemplos: `middleware` virou `src/proxy.ts`; `params` e `searchParams` são Promise; error boundary usa `retry()`, não `reset()`.
- **Cor só por token.** Nenhum componente cita cor literal nem usa `dark:`. O tema claro é o `@theme` de `src/app/globals.css`; o escuro é `:root.dark`, que redefine os mesmos tokens. Cor nova = token novo nos dois blocos.
- **Contraste mínimo 4,5:1**, nos dois temas. `src/lib/tema/tokens.test.ts` lê o `globals.css` e mede os pares — se falhar, ajuste o token, não o limite. No claro, ciano não é texto nem ação.
- **O `<html>` não recebe `className` no JSX** (o remonte do Strict Mode apagaria a classe `dark`). A fonte Geist entra pelo `<body>`.
- **Pele "Vidro GEX":** vidro (`bg-vidro border-vidro-borda backdrop-blur-md`) só no destaque da home, na lista de episódios, na lista lateral da aula e na barra do topo — nunca sobre capa. Selecionado = `bg-selecionado border-selecionado-borda text-selecionado-texto`. Progresso = `bg-gradient-to-r from-azul to-ciano`.
- **Arquivo `'use server'` só exporta função async.** Lógica pura vai num irmão `*-query.ts` (ou em `src/lib/`), testável sem request.
- **Regra de acesso mora em dois lugares que precisam concordar:** `src/lib/access/can-access-course.ts` e a função SQL `can_access_course`. `tests/db/paridade-acesso.test.ts` compara as duas.
- **RLS é por linha, não por coluna.** Liberar a linha libera todas as colunas.
- **Teste de banco:** todo fixture registrado na lixeira (`criarLixeira`) no escopo do módulo, antes de qualquer asserção. DELETE negado por RLS não dá erro — apaga zero linhas; a asserção é sobre a linha continuar existindo.
- **Capas:** área 1600×1000, curso 1280×800. Sem capa do curso, usa a da área; sem as duas, degradê (`capaComReserva`).
- **Textos de tela em português do Brasil.**
```

- [ ] **Step 2: Conferir e commitar**

Run: `head -1 CLAUDE.md` — Expected: `@AGENTS.md`.
Run: `node scripts/limpar-capas-orfas.mjs | head -3` e `ls scripts/` — Expected: os dois scripts citados existem.

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md com o guia do projeto, regras e a pele Vidro GEX"
```

---

## Depois das tasks

- Revisão do branch inteiro.
- Suíte completa na árvore mesclada: `npm run typecheck && npm run lint && npm test && npm run build && npm run test:db`, mais os specs E2E um a um (nunca `primeiro-acesso.spec.ts`).
- Captura final nos dois temas e dois tamanhos, conferida visualmente.
- Merge na `main` e push só com o ok do dono do produto — o push publica em produção.
