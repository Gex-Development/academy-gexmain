# GEX Academy — Fase 2: Conteúdo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O líder publica cursos e aulas com vídeo e documentos; o colaborador vê a vitrine completa da empresa, entra no que tem acesso e encontra cadeado no resto — com o bloqueio garantido também no banco.

**Architecture:** Continuação da fase 1. O parser de vídeo e o validador de anexos são funções puras em `src/lib/`; toda leitura de conteúdo passa por `src/server/`, que consulta `canAccessCourse` antes de devolver qualquer coisa. A última tarefa espelha essa mesma regra em políticas RLS, de modo que o banco recuse o que a aplicação recusaria.

**Tech Stack:** Next.js 16, TypeScript, Tailwind CSS v4, Supabase (Postgres/Storage), Zod, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-31-gex-academy-design.md`

**Pré-requisito:** Fase 1 concluída (`docs/superpowers/plans/2026-08-31-gex-academy-fase-1-fundacao.md`).

## Ordem de execução

As tarefas deste plano **não são executadas na ordem em que estão numeradas.**

A Task 7 cria as políticas RLS das tabelas de conteúdo. Sem elas, `courses`,
`lessons`, `lesson_attachments`, `course_access` e `access_requests` têm RLS
ligado e política nenhuma — o que significa que o cliente do usuário lê `[]` de
todas. As Tasks 2 a 6 construiriam telas que não mostram nada, e a saída óbvia
para quem estivesse implementando seria trocar para a chave de serviço, que
ignora o RLS de forma permanente.

Por isso a Task 7 é dividida:

| Ordem | O que executar |
|---|---|
| 1º | **Task 7, Steps 1-3** — migration `0003` e testes de RLS |
| 2º | Task 1 — parser de vídeo |
| 3º | Task 2 — cursos |
| 4º | Task 3 — aulas |
| 5º | Task 4 — anexos |
| 6º | Task 5 — vitrine |
| 7º | Task 6 — páginas de curso e aula |
| 8º | **Task 7, Steps 4-6** — E2E de bloqueio (depende das páginas) |

A migration só depende de tabelas criadas na fase 1, e a função SQL espelha
`canAccessCourse`, que também já existe. Nada impede que ela venha primeiro.

## Herança da fase 1 — leia antes de começar

A fase 1 terminou com revisão de branch inteiro limpa. Três coisas que ela
aprendeu, e que esta fase precisa respeitar:

**1. As políticas RLS das tabelas de conteúdo só chegam na Task 7 desta fase.**
Até lá, `courses`, `lessons`, `lesson_attachments`, `course_access`,
`access_requests`, `lesson_progress`, `questions` e `answers` têm RLS ligado e
**zero políticas** — o que significa que um cliente `createServerSupabase()` lê
`[]` de todas elas. Isso é falha fechada, e está correto.

⚠️ **Quando uma consulta sua voltar vazia por causa disso, a resposta NÃO é
trocar para `createAdminSupabase()`.** A chave de serviço ignora o RLS de forma
permanente e silenciosa, e é assim que a segunda camada de segurança some do
projeto. Ou escreva a política que falta, ou aceite o vazio até a Task 7.

**2. Erros de banco que chegam ao usuário carregam `GX001`.** Toda
`raise exception` nossa usa `using errcode = 'GX001'`; `toActionError` repassa só
esse código. Ver a seção "Convenção de erros do banco" no plano da fase 1.

**3. A paridade entre `canAccessCourse` e `can_access_course` não é testada por
nada.** São duas cópias da mesma regra de autorização, uma em TypeScript e outra
em SQL, e nada garante que concordem. A Task 7 desta fase, que cria a função SQL,
**deve** rodar a mesma matriz de 23 casos de `src/lib/access/can-access-course.test.ts`
contra a função do banco e comparar os resultados um a um. Sem isso, as duas
divergem com o tempo e só uma delas tem teste.

**4. Os testes deixam lixo no banco de desenvolvimento remoto**, que é
compartilhado. Nenhum arquivo tem `afterAll`. Esta fase deve criar um helper de
limpeza em `tests/db/client.ts` e usá-lo, antes que a lista de usuários do painel
de Auth fique inutilizável.

## Global Constraints

Valem as mesmas restrições da fase 1, repetidas aqui porque cada tarefa é lida isoladamente:

- Next.js **16**: o middleware é `src/proxy.ts` exportando `proxy`. Nunca `middleware.ts`.
- `@supabase/ssr` com `getAll`/`setAll` apenas. Nunca `get`, `set`, `remove`, nem `@supabase/auth-helpers-nextjs`.
- `SUPABASE_SERVICE_ROLE_KEY` e `RESEND_API_KEY` nunca com prefixo `NEXT_PUBLIC_`.
- Nenhum componente de tela chama o Supabase direto — tudo por `src/server/`.
- Toda server action valida com Zod e verifica papel. Devolve `ActionResult<T>`, nunca lança para a tela.
- **Nenhum HTML fornecido por usuário é renderizado.** Do snippet do VTurb extraem-se apenas identificadores; o embed é montado pela aplicação.
- Anexos: máximo **50 MB**; tipos aceitos PDF, DOCX, XLSX, PPTX, CSV, TXT, ZIP, PNG, JPG. Download **somente** por link assinado de **60 segundos**.
- RLS habilitado em todas as tabelas.
- **Todo teste de banco limpa o que criou.** As suítes rodam contra o projeto
  Supabase de verdade — o mesmo que os líderes usam. Na fase 1 elas deixaram 80
  usuários e 44 áreas para trás, que precisaram ser varridos à mão. Cada arquivo
  de teste registra os ids que cria e os remove num `afterAll`. O carimbo de
  `Date.now()` continua obrigatório para evitar colisão entre execuções, mas ele
  não substitui a limpeza.
- Interface em pt-BR. TypeScript `strict`, sem `any`.

---

### Task 1: Parser de vídeo (`lib/video`)

**Files:**
- Create: `src/lib/video/types.ts`
- Create: `src/lib/video/parse-video.ts`
- Create: `src/lib/video/index.ts`
- Test: `src/lib/video/parse-video.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type VideoProvider = 'youtube' | 'vturb'`
  - `type ParsedVideo = { provider: VideoProvider; ref: string }`
  - `parseVideoInput(input: string): ParsedVideo | null`
  - `youtubeEmbedUrl(ref: string): string`
  - `vturbScriptSrc(ref: string): string`
  - `vturbContainerId(ref: string): string`

  Formato do `ref`: YouTube guarda o id de 11 caracteres; VTurb guarda
  `"<contaUuid>/<playerId>/<versao>"` — ex.:
  `"e451b1fd-5061-402e-b7d3-3c5addf178dd/694a5bad71611df8184abb68/v4"`.

- [ ] **Step 1: Escrever os testes que falham**

Crie `src/lib/video/parse-video.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { parseVideoInput, vturbContainerId, vturbScriptSrc, youtubeEmbedUrl } from './parse-video'

// Valores reais de um snippet da conta VTurb da GEX. O id da CONTA é um UUID;
// o id do PLAYER são 24 caracteres hex (não é UUID) e o caminho traz a versão.
const CONTA = 'e451b1fd-5061-402e-b7d3-3c5addf178dd'
const PLAYER = '694a5bad71611df8184abb68'
const REF = `${CONTA}/${PLAYER}/v4`

describe('parseVideoInput — YouTube', () => {
  it('lê a URL padrão de watch', () => {
    expect(parseVideoInput('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({
      provider: 'youtube',
      ref: 'dQw4w9WgXcQ',
    })
  })

  it('lê o link curto youtu.be', () => {
    expect(parseVideoInput('https://youtu.be/dQw4w9WgXcQ')).toEqual({
      provider: 'youtube',
      ref: 'dQw4w9WgXcQ',
    })
  })

  it('lê a URL de embed', () => {
    expect(parseVideoInput('https://www.youtube.com/embed/dQw4w9WgXcQ')).toEqual({
      provider: 'youtube',
      ref: 'dQw4w9WgXcQ',
    })
  })

  it('ignora parâmetros extras como lista e tempo', () => {
    const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123&t=42s'
    expect(parseVideoInput(url)?.ref).toBe('dQw4w9WgXcQ')
  })

  it('aceita a URL sem protocolo', () => {
    expect(parseVideoInput('youtube.com/watch?v=dQw4w9WgXcQ')?.ref).toBe('dQw4w9WgXcQ')
  })

  it('recusa id com tamanho diferente de 11', () => {
    expect(parseVideoInput('https://www.youtube.com/watch?v=curto')).toBeNull()
  })

  it('monta a URL de embed sem cookies e sem vídeos relacionados', () => {
    expect(youtubeEmbedUrl('dQw4w9WgXcQ')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1',
    )
  })
})

describe('parseVideoInput — VTurb', () => {
  // Snippet real, copiado da conta da GEX. Repare que ele traz um web component
  // <vturb-smartplayer>, o id do player NÃO é UUID, e o caminho tem versão.
  const SNIPPET_REAL = `<vturb-smartplayer id="vid-${PLAYER}" style="display: block; margin: 0 auto; width: 100%; max-width: 400px;"><div class="vturb-player-placeholder" style="position: relative; width: 100%; padding: 125% 0 0; z-index: 0; background-color: black;"></div></vturb-smartplayer> <script type="text/javascript"> var s=document.createElement("script"); s.src="https://scripts.converteai.net/${CONTA}/players/${PLAYER}/v4/player.js", s.async=!0,document.head.appendChild(s); </script>`

  it('extrai conta, player e versão do snippet real', () => {
    expect(parseVideoInput(SNIPPET_REAL)).toEqual({ provider: 'vturb', ref: REF })
  })

  it('extrai também do bloco com preloads que o VTurb costuma acompanhar', () => {
    const comPreloads = `${SNIPPET_REAL}\n<link rel="preload" href="https://scripts.converteai.net/${CONTA}/players/${PLAYER}/v4/player.js" as="script">\n<link rel="dns-prefetch" href="https://cdn.converteai.net">`
    expect(parseVideoInput(comPreloads)).toEqual({ provider: 'vturb', ref: REF })
  })

  it('extrai da URL do player colada sozinha', () => {
    const url = `https://scripts.converteai.net/${CONTA}/players/${PLAYER}/v4/player.js`
    expect(parseVideoInput(url)).toEqual({ provider: 'vturb', ref: REF })
  })

  it('aceita o trio conta/player/versão digitado à mão', () => {
    expect(parseVideoInput(REF)).toEqual({ provider: 'vturb', ref: REF })
  })

  it('assume v4 quando o caminho não traz versão', () => {
    const semVersao = `https://scripts.converteai.net/${CONTA}/players/${PLAYER}/player.js`
    expect(parseVideoInput(semVersao)).toEqual({ provider: 'vturb', ref: REF })
  })

  it('não confunde o id do vídeo no CDN com o id do player', () => {
    // O snippet traz um terceiro id, do arquivo de mídia, que NÃO serve aqui.
    const soCdn = `<link rel="preload" href="https://cdn.converteai.net/${CONTA}/694a5b9d71611df8184abb66/main.m3u8" as="fetch">`
    expect(parseVideoInput(soCdn)).toBeNull()
  })

  it('recusa snippet só com o id da conta', () => {
    expect(parseVideoInput(`<script src="https://scripts.converteai.net/${CONTA}/x.js"></script>`)).toBeNull()
  })

  it('recusa id de player com tamanho errado', () => {
    const curto = `https://scripts.converteai.net/${CONTA}/players/abc123/v4/player.js`
    expect(parseVideoInput(curto)).toBeNull()
  })

  it('monta a URL do script a partir do ref', () => {
    expect(vturbScriptSrc(REF)).toBe(
      `https://scripts.converteai.net/${CONTA}/players/${PLAYER}/v4/player.js`,
    )
  })

  it('monta o id do container com hífen, como o snippet real', () => {
    expect(vturbContainerId(REF)).toBe(`vid-${PLAYER}`)
  })
})

describe('parseVideoInput — entradas inválidas', () => {
  it('recusa string vazia', () => {
    expect(parseVideoInput('')).toBeNull()
  })

  it('recusa só espaços', () => {
    expect(parseVideoInput('   ')).toBeNull()
  })

  it('recusa uma URL de outro provedor', () => {
    expect(parseVideoInput('https://vimeo.com/123456789')).toBeNull()
  })

  it('não devolve HTML executável em hipótese alguma', () => {
    const malicioso = `<script>alert(1)</script><img src=x onerror="alert(2)">`
    expect(parseVideoInput(malicioso)).toBeNull()
  })

  it('extrai apenas os identificadores mesmo com script malicioso junto', () => {
    const misto = `<script>alert(1)</script><script src="https://scripts.converteai.net/${CONTA}/players/${PLAYER}/player.js"></script>`
    const parsed = parseVideoInput(misto)
    expect(parsed).toEqual({ provider: 'vturb', ref: `${CONTA}/${PLAYER}` })
    expect(parsed!.ref).not.toContain('<')
    expect(parsed!.ref).not.toContain('alert')
  })
})
```

Os dois últimos testes são o núcleo da defesa contra XSS: o que sai desta função é sempre um par de identificadores, nunca marcação.

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- src/lib/video`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar o parser**

Crie `src/lib/video/types.ts`:

```typescript
export type VideoProvider = 'youtube' | 'vturb'
export type ParsedVideo = { provider: VideoProvider; ref: string }
```

Crie `src/lib/video/parse-video.ts`:

```typescript
import type { ParsedVideo } from './types'

const YOUTUBE_ID = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/

// Formatos confirmados contra um snippet real da conta VTurb da GEX:
//   conta   -> UUID
//   player  -> 24 caracteres hex, NÃO é UUID
//   versão  -> "v4" no caminho (opcional; ausente em snippets mais antigos)
// O host `scripts.converteai.net` é o do player. O `cdn.converteai.net` do mesmo
// snippet carrega o arquivo de mídia com um TERCEIRO id — que não serve aqui, e
// por isso o padrão exige o segmento `/players/`.
const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
const PLAYER_ID = '[0-9a-fA-F]{24}'
const VERSAO_PADRAO = 'v4'
const VTURB_URL = new RegExp(
  `scripts\\.converteai\\.net/(${UUID})/players/(${PLAYER_ID})(?:/(v\\d+))?/player\\.js`,
)
const VTURB_TRIO = new RegExp(`^(${UUID})/(${PLAYER_ID})(?:/(v\\d+))?$`)

/**
 * Identifica o provedor de vídeo a partir do que o líder colou no editor.
 *
 * Aceita URL do YouTube em qualquer formato, e do VTurb aceita o snippet de
 * incorporação inteiro, a URL do player ou o par "conta/player".
 *
 * SEGURANÇA: o retorno contém apenas identificadores extraídos por expressão
 * regular. Nenhum trecho do que o usuário colou é preservado para renderização,
 * então não existe caminho para injetar HTML ou script pela caixa de vídeo.
 */
export function parseVideoInput(input: string): ParsedVideo | null {
  const texto = input.trim()
  if (!texto) return null

  const youtube = texto.match(YOUTUBE_ID)
  if (youtube) return { provider: 'youtube', ref: youtube[1] }

  const vturb = texto.match(VTURB_URL) ?? texto.match(VTURB_TRIO)
  if (vturb) {
    const versao = vturb[3] ?? VERSAO_PADRAO
    return { provider: 'vturb', ref: `${vturb[1]}/${vturb[2]}/${versao}` }
  }

  return null
}

export function youtubeEmbedUrl(ref: string): string {
  return `https://www.youtube-nocookie.com/embed/${ref}?rel=0&modestbranding=1`
}

export function vturbScriptSrc(ref: string): string {
  const [conta, player, versao] = ref.split('/')
  return `https://scripts.converteai.net/${conta}/players/${player}/${versao}/player.js`
}

/** O snippet real usa hífen, não sublinhado: `id="vid-<playerId>"`. */
export function vturbContainerId(ref: string): string {
  return `vid-${ref.split('/')[1]}`
}
```

Crie `src/lib/video/index.ts`:

```typescript
export {
  parseVideoInput,
  vturbContainerId,
  vturbScriptSrc,
  youtubeEmbedUrl,
} from './parse-video'
export type { ParsedVideo, VideoProvider } from './types'
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- src/lib/video`
Expected: PASS — 18 testes.

- [ ] **Step 5: Conferência contra o snippet real — já feita**

Este passo pedia confrontar o parser com um código de incorporação de verdade.
Isso **já aconteceu** antes de a tarefa ser despachada, e o plano acima foi
corrigido: o snippet real da conta da GEX mostrou que três suposições estavam
erradas — havia um segmento de versão no caminho, o id do player não é UUID, e o
container é um web component `<vturb-smartplayer id="vid-...">` com hífen.

Os testes desta tarefa usam o snippet real. Não há nada a conferir aqui; apenas
confirme que os testes do VTurb passam com os valores reais embutidos neles.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(video): parser de YouTube e VTurb que extrai apenas identificadores"
```

---

### Task 2: Cursos — server actions e tela do líder

**Files:**
- Create: `src/server/courses.ts`
- Create: `src/app/(manage)/layout.tsx`
- Create: `src/app/(manage)/gerenciar/page.tsx`
- Create: `src/app/(manage)/gerenciar/course-form.tsx`
- Create: `src/app/(manage)/gerenciar/cursos/[id]/page.tsx`
- Create: `src/app/(manage)/gerenciar/cursos/[id]/course-settings.tsx`
- Test: `tests/db/courses.test.ts`

**Interfaces:**
- Consumes: `assertRole`, `getCurrentUser`, `canAccessCourse`, `slugify`, `ActionResult`, `createServerSupabase`.
- Produces:
  - `type ManagedCourse = { id: string; slug: string; title: string; description: string | null; coverUrl: string | null; status: CourseStatus; isOnboarding: boolean; areaId: string | null; areaName: string | null; lessonCount: number; publishedLessonCount: number }`
  - `listManagedCourses(): Promise<ManagedCourse[]>`
  - `getManagedCourse(id: string): Promise<ManagedCourse | null>`
  - `createCourse(_prev, formData): Promise<ActionResult<{ id: string }>>`
  - `updateCourse(_prev, formData): Promise<ActionResult<{ id: string }>>`
  - `setCourseStatus(_prev, formData): Promise<ActionResult<{ id: string }>>`

- [ ] **Step 1: Implementar as server actions de cursos**

Crie `src/server/courses.ts`:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { CourseStatus } from '@/lib/access'
import { assertRole } from '@/lib/auth/guards'
import { getCurrentUser } from '@/lib/auth/session'
import { slugify } from '@/lib/slug'
import { createServerSupabase } from '@/lib/supabase/server'
import { ok, toActionError, type ActionResult } from './result'

export type ManagedCourse = {
  id: string
  slug: string
  title: string
  description: string | null
  coverUrl: string | null
  status: CourseStatus
  isOnboarding: boolean
  areaId: string | null
  areaName: string | null
  lessonCount: number
  publishedLessonCount: number
}

const SELECT_CURSO =
  'id, slug, title, description, cover_url, status, is_onboarding, area_id, areas(name), lessons(id, status)'

type LinhaCurso = {
  id: string
  slug: string
  title: string
  description: string | null
  cover_url: string | null
  status: string
  is_onboarding: boolean
  area_id: string | null
  areas: { name: string } | null
  lessons: { id: string; status: string }[]
}

function paraManagedCourse(row: LinhaCurso): ManagedCourse {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    coverUrl: row.cover_url,
    status: row.status as CourseStatus,
    isOnboarding: row.is_onboarding,
    areaId: row.area_id,
    areaName: row.areas?.name ?? null,
    lessonCount: row.lessons.length,
    publishedLessonCount: row.lessons.filter((l) => l.status === 'published').length,
  }
}

/** Cursos que o usuário atual pode editar: os da sua área, ou todos, se admin. */
export async function listManagedCourses(): Promise<ManagedCourse[]> {
  const user = await getCurrentUser()
  if (!user || user.status !== 'active') return []
  if (user.role === 'member') return []

  const supabase = await createServerSupabase()
  let query = supabase.from('courses').select(SELECT_CURSO).order('position').order('title')

  if (user.role === 'leader') {
    if (!user.areaId) return []
    query = query.eq('area_id', user.areaId)
  }

  const { data } = await query
  return ((data ?? []) as unknown as LinhaCurso[]).map(paraManagedCourse)
}

export async function getManagedCourse(id: string): Promise<ManagedCourse | null> {
  const user = await getCurrentUser()
  if (!user || user.status !== 'active' || user.role === 'member') return null

  const supabase = await createServerSupabase()
  const { data } = await supabase.from('courses').select(SELECT_CURSO).eq('id', id).maybeSingle()
  if (!data) return null

  const curso = paraManagedCourse(data as unknown as LinhaCurso)
  if (user.role === 'admin') return curso
  if (user.areaId && curso.areaId === user.areaId) return curso
  return null
}

const cursoSchema = z.object({
  title: z.string().trim().min(3, 'O título precisa de ao menos 3 caracteres.').max(120),
  description: z.string().trim().max(600).optional().or(z.literal('')),
  coverUrl: z.string().trim().url('A capa precisa ser uma URL válida.').optional().or(z.literal('')),
})

export async function createCourse(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = assertRole(await getCurrentUser(), ['admin', 'leader'])

    const parsed = cursoSchema.safeParse(Object.fromEntries(formData))
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

    const isOnboarding = formData.get('isOnboarding') === 'on'
    if (isOnboarding && user.role !== 'admin') {
      return { ok: false, error: 'Somente o administrador cria a trilha inicial.' }
    }

    // Admin escolhe a área no formulário; líder cria sempre na própria área.
    const areaIdBruto = user.role === 'admin' ? String(formData.get('areaId') ?? '') : user.areaId
    const areaId = isOnboarding ? null : areaIdBruto || null
    if (!isOnboarding && !areaId) {
      return { ok: false, error: 'Escolha a área do curso.' }
    }

    const slugBase = slugify(parsed.data.title)
    if (!slugBase) return { ok: false, error: 'O título precisa conter letras ou números.' }

    const supabase = await createServerSupabase()
    const { data, error } = await supabase
      .from('courses')
      .insert({
        title: parsed.data.title,
        slug: `${slugBase}-${Date.now().toString(36)}`,
        description: parsed.data.description || null,
        cover_url: parsed.data.coverUrl || null,
        area_id: areaId,
        is_onboarding: isOnboarding,
        owner_id: user.id,
        status: 'draft',
      })
      .select('id')
      .single()

    if (error) {
      if (error.message.includes('courses_uma_trilha_inicial')) {
        return { ok: false, error: 'Já existe uma trilha inicial na plataforma.' }
      }
      throw error
    }

    revalidatePath('/gerenciar')
    return ok({ id: data.id })
  } catch (error) {
    return toActionError(error)
  }
}

export async function updateCourse(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    assertRole(await getCurrentUser(), ['admin', 'leader'])

    const id = z.string().uuid().safeParse(formData.get('id'))
    if (!id.success) return { ok: false, error: 'Curso inválido.' }

    // Confirma que este usuário pode editar ESTE curso, não apenas que é líder.
    if (!(await getManagedCourse(id.data))) {
      return { ok: false, error: 'Você não tem permissão para editar este curso.' }
    }

    const parsed = cursoSchema.safeParse(Object.fromEntries(formData))
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

    const supabase = await createServerSupabase()
    const { error } = await supabase
      .from('courses')
      .update({
        title: parsed.data.title,
        description: parsed.data.description || null,
        cover_url: parsed.data.coverUrl || null,
      })
      .eq('id', id.data)

    if (error) throw error

    revalidatePath('/gerenciar')
    revalidatePath(`/gerenciar/cursos/${id.data}`)
    revalidatePath('/')
    return ok({ id: id.data })
  } catch (error) {
    return toActionError(error)
  }
}

export async function setCourseStatus(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    assertRole(await getCurrentUser(), ['admin', 'leader'])

    const parsed = z
      .object({ id: z.string().uuid(), status: z.enum(['draft', 'published']) })
      .safeParse(Object.fromEntries(formData))
    if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }

    const curso = await getManagedCourse(parsed.data.id)
    if (!curso) return { ok: false, error: 'Você não tem permissão para editar este curso.' }

    // Capa bonita levando a curso vazio é pior do que curso nenhum.
    if (parsed.data.status === 'published' && curso.publishedLessonCount === 0) {
      return { ok: false, error: 'Publique ao menos uma aula antes de publicar o curso.' }
    }

    const supabase = await createServerSupabase()
    const { error } = await supabase
      .from('courses')
      .update({ status: parsed.data.status })
      .eq('id', parsed.data.id)

    if (error) throw error

    revalidatePath('/gerenciar')
    revalidatePath(`/gerenciar/cursos/${parsed.data.id}`)
    revalidatePath('/')
    return ok({ id: parsed.data.id })
  } catch (error) {
    return toActionError(error)
  }
}
```

`updateCourse` e `setCourseStatus` chamam `getManagedCourse` antes de escrever. `assertRole` só diz que a pessoa é líder — não diz que é líder **deste** curso. Sem essa segunda checagem, o líder de Design editaria os cursos de Tráfego.

- [ ] **Step 2: Criar o layout de gestão e a listagem de cursos**

Crie `src/app/(manage)/layout.tsx`:

```typescript
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { AppShell } from '@/components/layout/app-shell'
import { getCurrentUser } from '@/lib/auth/session'

export default async function ManageLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (user.status !== 'active' || user.role === 'member') redirect('/')

  return <AppShell user={user}>{children}</AppShell>
}
```

Crie `src/app/(manage)/gerenciar/page.tsx`:

```typescript
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth/session'
import { listAreas } from '@/server/areas'
import { listManagedCourses } from '@/server/courses'
import { CourseForm } from './course-form'

export const metadata = { title: 'Gerenciar — GEX Academy' }

export default async function GerenciarPage() {
  const [user, courses, areas] = await Promise.all([
    getCurrentUser(),
    listManagedCourses(),
    listAreas(),
  ])

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_340px]">
      <section>
        <h1 className="mb-4 text-xl font-semibold">Meus cursos</h1>
        {courses.length === 0 ? (
          <p className="text-sm text-texto-suave">
            Nenhum curso ainda. Crie o primeiro ao lado.
          </p>
        ) : (
          <ul className="divide-y divide-borda rounded-card border border-borda bg-superficie">
            {courses.map((course) => (
              <li key={course.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1">
                  <Link href={`/gerenciar/cursos/${course.id}`} className="text-sm font-medium hover:underline">
                    {course.title}
                  </Link>
                  <p className="text-xs text-texto-suave">
                    {course.isOnboarding ? 'Trilha inicial' : (course.areaName ?? 'Sem área')} ·{' '}
                    {course.publishedLessonCount} de {course.lessonCount} aulas publicadas
                  </p>
                </div>
                <span
                  className={
                    course.status === 'published'
                      ? 'rounded-full bg-sucesso/10 px-2 py-0.5 text-xs text-sucesso'
                      : 'rounded-full bg-aviso/10 px-2 py-0.5 text-xs text-aviso'
                  }
                >
                  {course.status === 'published' ? 'Publicado' : 'Rascunho'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-texto-suave">
          Novo curso
        </h2>
        <CourseForm areas={areas} isAdmin={user!.role === 'admin'} />
      </aside>
    </div>
  )
}
```

Crie `src/app/(manage)/gerenciar/course-form.tsx`:

```typescript
'use client'

import { useRouter } from 'next/navigation'
import { useActionState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import type { AreaRow } from '@/server/areas'
import { createCourse } from '@/server/courses'

export function CourseForm({ areas, isAdmin }: { areas: AreaRow[]; isAdmin: boolean }) {
  const router = useRouter()
  const [state, action, pending] = useActionState(createCourse, null)

  useEffect(() => {
    if (state?.ok) router.push(`/gerenciar/cursos/${state.data.id}`)
  }, [state, router])

  return (
    <form action={action} className="flex flex-col gap-4 rounded-card border border-borda bg-superficie p-4">
      <Field label="Título" htmlFor="title">
        <Input id="title" name="title" required minLength={3} maxLength={120} />
      </Field>
      <Field label="Descrição" htmlFor="description" hint="Aparece também no card bloqueado">
        <Input id="description" name="description" maxLength={600} />
      </Field>
      <Field label="URL da capa" htmlFor="coverUrl" hint="Opcional">
        <Input id="coverUrl" name="coverUrl" type="url" />
      </Field>

      {isAdmin && (
        <>
          <Field label="Área" htmlFor="areaId">
            <select
              id="areaId"
              name="areaId"
              className="w-full rounded-lg border border-borda bg-superficie px-3 py-2 text-sm"
            >
              <option value="">Escolha a área</option>
              {areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isOnboarding" />
            É a trilha inicial da empresa
          </label>
        </>
      )}

      {state && !state.ok && (
        <p role="alert" className="text-xs text-perigo">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? 'Criando…' : 'Criar curso'}
      </Button>
    </form>
  )
}
```

- [ ] **Step 3: Criar a tela de edição do curso**

Crie `src/app/(manage)/gerenciar/cursos/[id]/course-settings.tsx`:

```typescript
'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { setCourseStatus, updateCourse, type ManagedCourse } from '@/server/courses'

export function CourseSettings({ course }: { course: ManagedCourse }) {
  const [saveState, saveAction, saving] = useActionState(updateCourse, null)
  const [statusState, statusAction, changing] = useActionState(setCourseStatus, null)
  const publicando = course.status === 'draft'

  return (
    <div className="flex flex-col gap-6 rounded-card border border-borda bg-superficie p-4">
      <form action={saveAction} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={course.id} />
        <Field label="Título" htmlFor="title">
          <Input id="title" name="title" defaultValue={course.title} required maxLength={120} />
        </Field>
        <Field label="Descrição" htmlFor="description">
          <Input id="description" name="description" defaultValue={course.description ?? ''} maxLength={600} />
        </Field>
        <Field label="URL da capa" htmlFor="coverUrl">
          <Input id="coverUrl" name="coverUrl" type="url" defaultValue={course.coverUrl ?? ''} />
        </Field>
        {saveState && !saveState.ok && (
          <p role="alert" className="text-xs text-perigo">
            {saveState.error}
          </p>
        )}
        {saveState?.ok && <p className="text-xs text-sucesso">Curso salvo.</p>}
        <Button type="submit" variant="secundario" disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar alterações'}
        </Button>
      </form>

      <form action={statusAction} className="border-t border-borda pt-4">
        <input type="hidden" name="id" value={course.id} />
        <input type="hidden" name="status" value={publicando ? 'published' : 'draft'} />
        <p className="mb-2 text-xs text-texto-suave">
          {publicando
            ? 'Publicar deixa o curso visível na vitrine de toda a empresa.'
            : 'Despublicar tira o curso da vitrine. O progresso dos alunos é preservado.'}
        </p>
        {statusState && !statusState.ok && (
          <p role="alert" className="mb-2 text-xs text-perigo">
            {statusState.error}
          </p>
        )}
        <Button type="submit" disabled={changing}>
          {publicando ? 'Publicar curso' : 'Voltar para rascunho'}
        </Button>
      </form>
    </div>
  )
}
```

Crie `src/app/(manage)/gerenciar/cursos/[id]/page.tsx`:

```typescript
import { notFound } from 'next/navigation'
import { getManagedCourse } from '@/server/courses'
import { CourseSettings } from './course-settings'

export default async function EditarCursoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const course = await getManagedCourse(id)
  if (!course) notFound()

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_360px]">
      <section>
        <h1 className="text-xl font-semibold">{course.title}</h1>
        <p className="mt-1 text-sm text-texto-suave">
          {course.isOnboarding ? 'Trilha inicial' : (course.areaName ?? 'Sem área')}
        </p>
        <p className="mt-6 text-sm text-texto-suave">
          A lista de aulas aparece aqui na próxima tarefa.
        </p>
      </section>
      <aside>
        <CourseSettings course={course} />
      </aside>
    </div>
  )
}
```

- [ ] **Step 4: Criar o helper de limpeza e aplicá-lo aos testes existentes**

Antes de acrescentar mais um arquivo de teste de banco, feche a torneira. Os três
arquivos da fase 1 (`schema.test.ts`, `areas.test.ts`, `people.test.ts`) criam
usuários, áreas e cursos no projeto real e não removem nada.

Acrescente a `tests/db/client.ts`:

```typescript
/**
 * Acumula os ids criados por um arquivo de teste e os remove no fim.
 *
 * Os testes rodam contra o projeto Supabase de verdade — o mesmo que os líderes
 * usam. Sem isso, cada execução deixa dezenas de usuários e áreas para trás.
 * A ordem de remoção importa: cursos antes de áreas (`courses.area_id` é
 * ON DELETE RESTRICT) e usuários por último (apagar `auth.users` derruba o
 * perfil em cascata).
 */
export function criarLixeira() {
  const cursos: string[] = []
  const areas: string[] = []
  const usuarios: string[] = []

  return {
    curso: (id: string) => cursos.push(id),
    area: (id: string) => areas.push(id),
    usuario: (id: string) => usuarios.push(id),
    async limpar() {
      const db = adminClient()
      for (const id of cursos) await db.from('courses').delete().eq('id', id)
      for (const id of areas) await db.from('areas').delete().eq('id', id)
      for (const id of usuarios) await db.auth.admin.deleteUser(id)
    },
  }
}
```

Em cada arquivo de teste de banco — os três existentes e o que você cria no
próximo passo — instancie a lixeira, registre cada fixture logo depois de criá-la,
e chame `afterAll(() => lixeira.limpar())`.

Confirme que funcionou: rode `npm run test:db` duas vezes seguidas e verifique com
`node scripts/limpar-dados-de-teste.mjs` (a simulação) que a contagem de perfis e
áreas de teste voltou a zero nas duas vezes.

- [ ] **Step 5: Escrever o teste de integração dos cursos**

Crie `tests/db/courses.test.ts`:

```typescript
import { beforeAll, describe, expect, it } from 'vitest'
import { adminClient, createTestUser } from './client'

const db = adminClient()
let areaTrafego: string
let ownerId: string

beforeAll(async () => {
  const stamp = Date.now()
  const { data } = await db
    .from('areas')
    .insert({ name: 'Tráfego', slug: `trafego-c-${stamp}` })
    .select('id')
    .single()
  areaTrafego = data!.id
  ownerId = await createTestUser({
    email: `dono-curso-${stamp}@gexcorp.com.br`,
    fullName: 'Dono do Curso',
    role: 'leader',
    areaId: areaTrafego,
  })
})

describe('cursos', () => {
  it('apaga as aulas junto com o curso', async () => {
    const { data: course } = await db
      .from('courses')
      .insert({
        title: 'Curso descartável',
        slug: `descartavel-${Date.now()}`,
        area_id: areaTrafego,
        owner_id: ownerId,
      })
      .select('id')
      .single()

    await db.from('lessons').insert({
      course_id: course!.id,
      title: 'Aula 1',
      slug: 'aula-1',
      video_provider: 'youtube',
      video_ref: 'dQw4w9WgXcQ',
    })

    await db.from('courses').delete().eq('id', course!.id)

    const { data: aulas } = await db.from('lessons').select('id').eq('course_id', course!.id)
    expect(aulas).toEqual([])
  })

  it('impede duas aulas com o mesmo slug no mesmo curso', async () => {
    const { data: course } = await db
      .from('courses')
      .insert({
        title: 'Curso com slugs',
        slug: `slugs-${Date.now()}`,
        area_id: areaTrafego,
        owner_id: ownerId,
      })
      .select('id')
      .single()

    const base = {
      course_id: course!.id,
      title: 'Introdução',
      slug: 'introducao',
      video_provider: 'youtube' as const,
      video_ref: 'dQw4w9WgXcQ',
    }
    expect((await db.from('lessons').insert(base)).error).toBeNull()
    expect((await db.from('lessons').insert(base)).error?.code).toBe('23505')
  })

  it('permite o mesmo slug de aula em cursos diferentes', async () => {
    const stamp = Date.now()
    const cursos = await db
      .from('courses')
      .insert([
        { title: 'A', slug: `a-${stamp}`, area_id: areaTrafego, owner_id: ownerId },
        { title: 'B', slug: `b-${stamp}`, area_id: areaTrafego, owner_id: ownerId },
      ])
      .select('id')

    for (const curso of cursos.data!) {
      const { error } = await db.from('lessons').insert({
        course_id: curso.id,
        title: 'Introdução',
        slug: 'introducao',
        video_provider: 'youtube',
        video_ref: 'dQw4w9WgXcQ',
      })
      expect(error).toBeNull()
    }
  })

  it('recusa provedor de vídeo desconhecido', async () => {
    const { data: course } = await db
      .from('courses')
      .insert({
        title: 'Curso provedor',
        slug: `provedor-${Date.now()}`,
        area_id: areaTrafego,
        owner_id: ownerId,
      })
      .select('id')
      .single()

    const { error } = await db.from('lessons').insert({
      course_id: course!.id,
      title: 'Aula',
      slug: 'aula',
      // @ts-expect-error provedor inválido de propósito
      video_provider: 'vimeo',
      video_ref: 'x',
    })
    expect(error?.message).toContain('lessons_video_provider_check')
  })
})
```

- [ ] **Step 6: Rodar tudo**

Run: `npm test && npm run test:db && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(cursos): criacao, edicao e publicacao com checagem por curso, nao so por papel"
```

---

### Task 3: Aulas — editor, vídeo e ordenação

**Files:**
- Create: `src/server/lessons.ts`
- Create: `src/app/(manage)/gerenciar/cursos/[id]/lesson-list.tsx`
- Create: `src/app/(manage)/gerenciar/cursos/[id]/aulas/[lessonId]/page.tsx`
- Create: `src/app/(manage)/gerenciar/cursos/[id]/aulas/[lessonId]/lesson-form.tsx`
- Create: `src/components/video/video-player.tsx`
- Modify: `src/app/(manage)/gerenciar/cursos/[id]/page.tsx`

**Interfaces:**
- Consumes: `parseVideoInput`, `youtubeEmbedUrl`, `vturbScriptSrc`, `vturbContainerId`, `getManagedCourse`, `assertRole`, `ActionResult`.
- Produces:
  - `type LessonRow = { id: string; courseId: string; slug: string; title: string; description: string | null; provider: VideoProvider; ref: string; durationSeconds: number | null; status: CourseStatus; position: number }`
  - `listLessons(courseId: string): Promise<LessonRow[]>`
  - `getLessonForEdit(lessonId: string): Promise<LessonRow | null>`
  - `createLesson(_prev, formData): Promise<ActionResult<{ id: string }>>`
  - `updateLesson(_prev, formData): Promise<ActionResult<{ id: string }>>`
  - `setLessonStatus(_prev, formData): Promise<ActionResult<{ id: string }>>`
  - `moveLesson(_prev, formData): Promise<ActionResult<null>>`
  - `deleteLesson(_prev, formData): Promise<ActionResult<null>>`
  - `<VideoPlayer provider ref title />` em `src/components/video/video-player.tsx`

- [ ] **Step 1: Implementar as server actions de aulas**

Crie `src/server/lessons.ts`:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { CourseStatus } from '@/lib/access'
import { assertRole } from '@/lib/auth/guards'
import { getCurrentUser } from '@/lib/auth/session'
import { slugify } from '@/lib/slug'
import { createServerSupabase } from '@/lib/supabase/server'
import { parseVideoInput, type VideoProvider } from '@/lib/video'
import { getManagedCourse } from './courses'
import { ok, toActionError, type ActionResult } from './result'

export type LessonRow = {
  id: string
  courseId: string
  slug: string
  title: string
  description: string | null
  provider: VideoProvider
  ref: string
  durationSeconds: number | null
  status: CourseStatus
  position: number
}

const SELECT_AULA =
  'id, course_id, slug, title, description, video_provider, video_ref, duration_seconds, status, position'

type LinhaAula = {
  id: string
  course_id: string
  slug: string
  title: string
  description: string | null
  video_provider: string
  video_ref: string
  duration_seconds: number | null
  status: string
  position: number
}

function paraLessonRow(row: LinhaAula): LessonRow {
  return {
    id: row.id,
    courseId: row.course_id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    provider: row.video_provider as VideoProvider,
    ref: row.video_ref,
    durationSeconds: row.duration_seconds,
    status: row.status as CourseStatus,
    position: row.position,
  }
}

export async function listLessons(courseId: string): Promise<LessonRow[]> {
  if (!(await getManagedCourse(courseId))) return []

  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('lessons')
    .select(SELECT_AULA)
    .eq('course_id', courseId)
    .order('position')
    .order('created_at')

  return ((data ?? []) as LinhaAula[]).map(paraLessonRow)
}

export async function getLessonForEdit(lessonId: string): Promise<LessonRow | null> {
  const supabase = await createServerSupabase()
  const { data } = await supabase.from('lessons').select(SELECT_AULA).eq('id', lessonId).maybeSingle()
  if (!data) return null

  const aula = paraLessonRow(data as LinhaAula)
  if (!(await getManagedCourse(aula.courseId))) return null
  return aula
}

const aulaSchema = z.object({
  title: z.string().trim().min(3, 'O título precisa de ao menos 3 caracteres.').max(120),
  description: z.string().trim().max(4000).optional().or(z.literal('')),
  video: z.string().trim().min(1, 'Cole o link do YouTube ou o código do VTurb.'),
  durationMinutes: z.coerce.number().int().min(0).max(600).optional(),
})

export async function createLesson(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    assertRole(await getCurrentUser(), ['admin', 'leader'])

    const courseId = z.string().uuid().safeParse(formData.get('courseId'))
    if (!courseId.success) return { ok: false, error: 'Curso inválido.' }
    if (!(await getManagedCourse(courseId.data))) {
      return { ok: false, error: 'Você não tem permissão para editar este curso.' }
    }

    const parsed = aulaSchema.safeParse(Object.fromEntries(formData))
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

    const video = parseVideoInput(parsed.data.video)
    if (!video) {
      return {
        ok: false,
        error: 'Não reconhecemos esse vídeo. Cole o link do YouTube ou o código de incorporação do VTurb.',
      }
    }

    const supabase = await createServerSupabase()
    const { data: ultima } = await supabase
      .from('lessons')
      .select('position')
      .eq('course_id', courseId.data)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle()

    const slugBase = slugify(parsed.data.title) || 'aula'
    const { data, error } = await supabase
      .from('lessons')
      .insert({
        course_id: courseId.data,
        title: parsed.data.title,
        slug: `${slugBase}-${Date.now().toString(36)}`,
        description: parsed.data.description || null,
        video_provider: video.provider,
        video_ref: video.ref,
        duration_seconds: parsed.data.durationMinutes ? parsed.data.durationMinutes * 60 : null,
        position: (ultima?.position ?? -1) + 1,
        status: 'draft',
      })
      .select('id')
      .single()

    if (error) throw error

    revalidatePath(`/gerenciar/cursos/${courseId.data}`)
    return ok({ id: data.id })
  } catch (error) {
    return toActionError(error)
  }
}

export async function updateLesson(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    assertRole(await getCurrentUser(), ['admin', 'leader'])

    const id = z.string().uuid().safeParse(formData.get('id'))
    if (!id.success) return { ok: false, error: 'Aula inválida.' }

    const aula = await getLessonForEdit(id.data)
    if (!aula) return { ok: false, error: 'Você não tem permissão para editar esta aula.' }

    const parsed = aulaSchema.safeParse(Object.fromEntries(formData))
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

    const video = parseVideoInput(parsed.data.video)
    if (!video) {
      return {
        ok: false,
        error: 'Não reconhecemos esse vídeo. Cole o link do YouTube ou o código de incorporação do VTurb.',
      }
    }

    const supabase = await createServerSupabase()
    const { error } = await supabase
      .from('lessons')
      .update({
        title: parsed.data.title,
        description: parsed.data.description || null,
        video_provider: video.provider,
        video_ref: video.ref,
        duration_seconds: parsed.data.durationMinutes ? parsed.data.durationMinutes * 60 : null,
      })
      .eq('id', id.data)

    if (error) throw error

    revalidatePath(`/gerenciar/cursos/${aula.courseId}`)
    revalidatePath(`/gerenciar/cursos/${aula.courseId}/aulas/${id.data}`)
    return ok({ id: id.data })
  } catch (error) {
    return toActionError(error)
  }
}

export async function setLessonStatus(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    assertRole(await getCurrentUser(), ['admin', 'leader'])

    const parsed = z
      .object({ id: z.string().uuid(), status: z.enum(['draft', 'published']) })
      .safeParse(Object.fromEntries(formData))
    if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }

    const aula = await getLessonForEdit(parsed.data.id)
    if (!aula) return { ok: false, error: 'Você não tem permissão para editar esta aula.' }

    const supabase = await createServerSupabase()
    const { error } = await supabase
      .from('lessons')
      .update({ status: parsed.data.status })
      .eq('id', parsed.data.id)

    if (error) throw error

    revalidatePath(`/gerenciar/cursos/${aula.courseId}`)
    revalidatePath('/')
    return ok({ id: parsed.data.id })
  } catch (error) {
    return toActionError(error)
  }
}

export async function moveLesson(_prev: unknown, formData: FormData): Promise<ActionResult<null>> {
  try {
    assertRole(await getCurrentUser(), ['admin', 'leader'])

    const parsed = z
      .object({ id: z.string().uuid(), direcao: z.enum(['cima', 'baixo']) })
      .safeParse(Object.fromEntries(formData))
    if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }

    const aula = await getLessonForEdit(parsed.data.id)
    if (!aula) return { ok: false, error: 'Você não tem permissão para editar esta aula.' }

    const aulas = await listLessons(aula.courseId)
    const indice = aulas.findIndex((a) => a.id === aula.id)
    const destino = parsed.data.direcao === 'cima' ? indice - 1 : indice + 1
    if (destino < 0 || destino >= aulas.length) return ok(null)

    // Reescreve as posições da lista inteira: mais simples e sempre consistente,
    // já que um curso tem dezenas de aulas, não milhares.
    const reordenadas = [...aulas]
    const [movida] = reordenadas.splice(indice, 1)
    reordenadas.splice(destino, 0, movida)

    const supabase = await createServerSupabase()
    for (const [posicao, item] of reordenadas.entries()) {
      const { error } = await supabase.from('lessons').update({ position: posicao }).eq('id', item.id)
      if (error) throw error
    }

    revalidatePath(`/gerenciar/cursos/${aula.courseId}`)
    revalidatePath('/')
    return ok(null)
  } catch (error) {
    return toActionError(error)
  }
}

export async function deleteLesson(_prev: unknown, formData: FormData): Promise<ActionResult<null>> {
  try {
    assertRole(await getCurrentUser(), ['admin', 'leader'])

    const id = z.string().uuid().safeParse(formData.get('id'))
    if (!id.success) return { ok: false, error: 'Aula inválida.' }

    const aula = await getLessonForEdit(id.data)
    if (!aula) return { ok: false, error: 'Você não tem permissão para excluir esta aula.' }

    const supabase = await createServerSupabase()
    const { error } = await supabase.from('lessons').delete().eq('id', id.data)
    if (error) throw error

    revalidatePath(`/gerenciar/cursos/${aula.courseId}`)
    revalidatePath('/')
    return ok(null)
  } catch (error) {
    return toActionError(error)
  }
}
```

- [ ] **Step 2: Criar o player de vídeo**

Crie `src/components/video/video-player.tsx`:

```typescript
'use client'

import Script from 'next/script'
import { createElement } from 'react'
import type { VideoProvider } from '@/lib/video'
import { vturbContainerId, vturbScriptSrc, youtubeEmbedUrl } from '@/lib/video'

/**
 * Renderiza o player a partir de identificadores validados.
 * Nada aqui vem de HTML colado por usuário: `videoRef` já passou por
 * parseVideoInput e contém apenas ids.
 */
export function VideoPlayer({
  provider,
  videoRef,
  title,
}: {
  provider: VideoProvider
  videoRef: string
  title: string
}) {
  if (provider === 'youtube') {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-card bg-black">
        <iframe
          src={youtubeEmbedUrl(videoRef)}
          title={title}
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="h-full w-full border-0"
        />
      </div>
    )
  }

  // O VTurb não usa uma <div>: o player.js registra o custom element
  // <vturb-smartplayer> e procura o elemento com id "vid-<playerId>".
  // Usamos createElement em vez de JSX porque JSX exigiria declarar o elemento
  // em IntrinsicElements, e o caminho dessa declaração mudou entre versões do
  // React — createElement funciona em qualquer uma, sem tipagem ambiente.
  return (
    <div className="w-full overflow-hidden rounded-card bg-black">
      {createElement(
        'vturb-smartplayer',
        { id: vturbContainerId(videoRef), style: { display: 'block', width: '100%' } },
        // Reserva o espaço antes de o player carregar. 56.25% = 16:9, a
        // proporção usual de aula gravada; o player se reajusta ao carregar,
        // então um vídeo vertical não fica cortado, só reflui.
        <div style={{ position: 'relative', width: '100%', padding: '56.25% 0 0', backgroundColor: 'black' }} />,
      )}
      <Script src={vturbScriptSrc(videoRef)} strategy="afterInteractive" />
    </div>
  )
}
```

- [ ] **Step 3: Criar o editor de aula**

Crie `src/app/(manage)/gerenciar/cursos/[id]/aulas/[lessonId]/lesson-form.tsx`:

```typescript
'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { VideoPlayer } from '@/components/video/video-player'
import { parseVideoInput } from '@/lib/video'
import { setLessonStatus, updateLesson, type LessonRow } from '@/server/lessons'

export function LessonForm({ lesson }: { lesson: LessonRow }) {
  const [videoInput, setVideoInput] = useState(
    lesson.provider === 'youtube'
      ? `https://www.youtube.com/watch?v=${lesson.ref}`
      : lesson.ref,
  )
  const preview = parseVideoInput(videoInput)

  const [saveState, saveAction, saving] = useActionState(updateLesson, null)
  const [statusState, statusAction, changing] = useActionState(setLessonStatus, null)
  const publicando = lesson.status === 'draft'

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_360px]">
      <form action={saveAction} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={lesson.id} />

        <Field label="Título da aula" htmlFor="title">
          <Input id="title" name="title" defaultValue={lesson.title} required maxLength={120} />
        </Field>

        <Field
          label="Vídeo"
          htmlFor="video"
          hint="Cole o link do YouTube ou o código de incorporação do VTurb."
          error={!videoInput || preview ? undefined : 'Não reconhecemos esse vídeo.'}
        >
          <textarea
            id="video"
            name="video"
            required
            rows={3}
            value={videoInput}
            onChange={(e) => setVideoInput(e.target.value)}
            className="w-full rounded-lg border border-borda bg-superficie px-3 py-2 font-mono text-xs"
          />
        </Field>

        <p className="rounded-lg bg-aviso/10 p-3 text-xs text-aviso">
          <strong>Conteúdo confidencial?</strong> Vídeo “não listado” no YouTube é acessível por
          qualquer pessoa com o link — ele fica escondido, não protegido. Para números, processos
          internos ou contratos, use o VTurb com trava de domínio.
        </p>

        <Field label="Descrição" htmlFor="description" hint="Texto simples, sem formatação">
          <textarea
            id="description"
            name="description"
            rows={6}
            defaultValue={lesson.description ?? ''}
            maxLength={4000}
            className="w-full rounded-lg border border-borda bg-superficie px-3 py-2 text-sm"
          />
        </Field>

        <Field label="Duração em minutos" htmlFor="durationMinutes" hint="Opcional">
          <Input
            id="durationMinutes"
            name="durationMinutes"
            type="number"
            min={0}
            max={600}
            defaultValue={lesson.durationSeconds ? Math.round(lesson.durationSeconds / 60) : ''}
          />
        </Field>

        {saveState && !saveState.ok && (
          <p role="alert" className="text-xs text-perigo">
            {saveState.error}
          </p>
        )}
        {saveState?.ok && <p className="text-xs text-sucesso">Aula salva.</p>}

        <Button type="submit" disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar aula'}
        </Button>
      </form>

      <aside className="flex flex-col gap-4">
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-texto-suave">
            Prévia
          </h2>
          {preview ? (
            <VideoPlayer provider={preview.provider} videoRef={preview.ref} title={lesson.title} />
          ) : (
            <p className="rounded-card border border-dashed border-borda p-6 text-center text-xs text-texto-suave">
              Cole um vídeo válido para ver a prévia.
            </p>
          )}
        </div>

        <form action={statusAction} className="rounded-card border border-borda bg-superficie p-4">
          <input type="hidden" name="id" value={lesson.id} />
          <input type="hidden" name="status" value={publicando ? 'published' : 'draft'} />
          <p className="mb-2 text-xs text-texto-suave">
            {publicando
              ? 'Aula em rascunho: invisível para os alunos.'
              : 'Aula publicada e visível para quem tem acesso ao curso.'}
          </p>
          {statusState && !statusState.ok && (
            <p role="alert" className="mb-2 text-xs text-perigo">
              {statusState.error}
            </p>
          )}
          <Button type="submit" variant="secundario" disabled={changing}>
            {publicando ? 'Publicar aula' : 'Voltar para rascunho'}
          </Button>
        </form>
      </aside>
    </div>
  )
}
```

Crie `src/app/(manage)/gerenciar/cursos/[id]/aulas/[lessonId]/page.tsx`:

```typescript
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getLessonForEdit } from '@/server/lessons'
import { LessonForm } from './lesson-form'

export default async function EditarAulaPage({
  params,
}: {
  params: Promise<{ id: string; lessonId: string }>
}) {
  const { id, lessonId } = await params
  const lesson = await getLessonForEdit(lessonId)
  if (!lesson || lesson.courseId !== id) notFound()

  return (
    <div>
      <Link href={`/gerenciar/cursos/${id}`} className="text-xs text-texto-suave hover:underline">
        ← Voltar ao curso
      </Link>
      <h1 className="mb-6 mt-2 text-xl font-semibold">{lesson.title}</h1>
      <LessonForm lesson={lesson} />
    </div>
  )
}
```

- [ ] **Step 4: Criar a lista de aulas na página do curso**

Crie `src/app/(manage)/gerenciar/cursos/[id]/lesson-list.tsx`:

```typescript
'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { formatDuration } from '@/lib/format'
import { createLesson, deleteLesson, moveLesson, type LessonRow } from '@/server/lessons'

export function LessonList({ courseId, lessons }: { courseId: string; lessons: LessonRow[] }) {
  const [createState, createAction, creating] = useActionState(createLesson, null)
  const [moveState, moveAction] = useActionState(moveLesson, null)
  const [deleteState, deleteAction] = useActionState(deleteLesson, null)
  const erro =
    (!createState?.ok && createState?.error) ||
    (!moveState?.ok && moveState?.error) ||
    (!deleteState?.ok && deleteState?.error)

  return (
    <div className="flex flex-col gap-6">
      <ul className="divide-y divide-borda rounded-card border border-borda bg-superficie">
        {lessons.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-texto-suave">
            Nenhuma aula ainda. Crie a primeira abaixo.
          </li>
        )}
        {lessons.map((lesson, indice) => (
          <li key={lesson.id} className="flex items-center gap-3 px-4 py-3">
            <span className="w-6 text-xs text-texto-suave">{indice + 1}</span>
            <div className="flex-1">
              <Link
                href={`/gerenciar/cursos/${courseId}/aulas/${lesson.id}`}
                className="text-sm font-medium hover:underline"
              >
                {lesson.title}
              </Link>
              <p className="text-xs text-texto-suave">
                {lesson.provider === 'youtube' ? 'YouTube' : 'VTurb'} ·{' '}
                {formatDuration(lesson.durationSeconds)} ·{' '}
                {lesson.status === 'published' ? 'Publicada' : 'Rascunho'}
              </p>
            </div>

            <form action={moveAction}>
              <input type="hidden" name="id" value={lesson.id} />
              <input type="hidden" name="direcao" value="cima" />
              <Button type="submit" variant="secundario" className="px-2 py-1 text-xs" disabled={indice === 0}>
                ↑
              </Button>
            </form>
            <form action={moveAction}>
              <input type="hidden" name="id" value={lesson.id} />
              <input type="hidden" name="direcao" value="baixo" />
              <Button
                type="submit"
                variant="secundario"
                className="px-2 py-1 text-xs"
                disabled={indice === lessons.length - 1}
              >
                ↓
              </Button>
            </form>
            <form
              action={deleteAction}
              onSubmit={(e) => {
                if (
                  !confirm(
                    `Excluir a aula "${lesson.title}"? Isso apaga os anexos, as dúvidas e o registro de conclusão de quem já assistiu.`,
                  )
                ) {
                  e.preventDefault()
                }
              }}
            >
              <input type="hidden" name="id" value={lesson.id} />
              <Button type="submit" variant="perigo" className="px-2 py-1 text-xs">
                Excluir
              </Button>
            </form>
          </li>
        ))}
      </ul>

      {erro && (
        <p role="alert" className="text-xs text-perigo">
          {erro}
        </p>
      )}

      <form action={createAction} className="flex flex-col gap-4 rounded-card border border-borda bg-superficie p-4">
        <h2 className="text-sm font-semibold">Nova aula</h2>
        <input type="hidden" name="courseId" value={courseId} />
        <Field label="Título" htmlFor="novo-title">
          <Input id="novo-title" name="title" required minLength={3} maxLength={120} />
        </Field>
        <Field label="Vídeo" htmlFor="novo-video" hint="Link do YouTube ou código do VTurb">
          <Input id="novo-video" name="video" required />
        </Field>
        <Button type="submit" disabled={creating}>
          {creating ? 'Criando…' : 'Criar aula'}
        </Button>
      </form>
    </div>
  )
}
```

Substitua o `<section>` de `src/app/(manage)/gerenciar/cursos/[id]/page.tsx` para usar a lista:

```typescript
import { notFound } from 'next/navigation'
import { getManagedCourse } from '@/server/courses'
import { listLessons } from '@/server/lessons'
import { CourseSettings } from './course-settings'
import { LessonList } from './lesson-list'

export default async function EditarCursoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [course, lessons] = await Promise.all([getManagedCourse(id), listLessons(id)])
  if (!course) notFound()

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_360px]">
      <section>
        <h1 className="text-xl font-semibold">{course.title}</h1>
        <p className="mb-6 mt-1 text-sm text-texto-suave">
          {course.isOnboarding ? 'Trilha inicial' : (course.areaName ?? 'Sem área')}
        </p>
        <LessonList courseId={course.id} lessons={lessons} />
      </section>
      <aside>
        <CourseSettings course={course} />
      </aside>
    </div>
  )
}
```

- [ ] **Step 5: Rodar tudo**

Run: `npm test && npm run test:db && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(aulas): editor com previa de video, ordenacao e publicacao por aula"
```

---

### Task 4: Anexos — upload, listagem e download assinado

**Files:**
- Create: `src/lib/storage/attachments.ts`
- Create: `src/server/attachments.ts`
- Create: `src/app/(manage)/gerenciar/cursos/[id]/aulas/[lessonId]/attachment-manager.tsx`
- Create: `src/app/api/anexos/[id]/route.ts`
- Modify: `src/app/(manage)/gerenciar/cursos/[id]/aulas/[lessonId]/page.tsx`
- Test: `src/lib/storage/attachments.test.ts`

**Interfaces:**
- Consumes: `getManagedCourse`, `getLessonForEdit`, `canAccessCourse`, `createAdminSupabase`, `assertRole`.
- Produces:
  - `ATTACHMENT_BUCKET`, `MAX_ATTACHMENT_BYTES`, `ALLOWED_ATTACHMENT_MIME`
  - `validateAttachment(file: { name: string; type: string; size: number }): string | null`
  - `buildAttachmentPath(lessonId: string, fileName: string): string`
  - `type AttachmentRow = { id: string; fileName: string; sizeBytes: number; mimeType: string }`
  - `listAttachments(lessonId: string): Promise<AttachmentRow[]>`
  - `uploadAttachment(_prev, formData): Promise<ActionResult<{ id: string }>>`
  - `deleteAttachment(_prev, formData): Promise<ActionResult<null>>`
  - Rota `GET /api/anexos/[id]` que redireciona para o link assinado.

- [ ] **Step 1: Escrever os testes que falham do validador**

Crie `src/lib/storage/attachments.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import {
  buildAttachmentPath,
  MAX_ATTACHMENT_BYTES,
  validateAttachment,
} from './attachments'

const pdf = { name: 'manual.pdf', type: 'application/pdf', size: 1024 }

describe('validateAttachment', () => {
  it('aceita um PDF dentro do limite', () => {
    expect(validateAttachment(pdf)).toBeNull()
  })

  it('aceita planilha, apresentação e imagem', () => {
    expect(
      validateAttachment({
        name: 'metas.xlsx',
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: 2048,
      }),
    ).toBeNull()
    expect(
      validateAttachment({
        name: 'deck.pptx',
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        size: 2048,
      }),
    ).toBeNull()
    expect(validateAttachment({ name: 'print.png', type: 'image/png', size: 2048 })).toBeNull()
  })

  it('recusa arquivo vazio', () => {
    expect(validateAttachment({ ...pdf, size: 0 })).toBe('O arquivo está vazio.')
  })

  it('recusa acima de 50 MB', () => {
    const erro = validateAttachment({ ...pdf, size: MAX_ATTACHMENT_BYTES + 1 })
    expect(erro).toBe('O arquivo passa de 50 MB.')
  })

  it('aceita exatamente 50 MB', () => {
    expect(validateAttachment({ ...pdf, size: MAX_ATTACHMENT_BYTES })).toBeNull()
  })

  it('recusa executável', () => {
    const erro = validateAttachment({ name: 'virus.exe', type: 'application/x-msdownload', size: 100 })
    expect(erro).toBe('Tipo de arquivo não permitido.')
  })

  it('recusa HTML, que poderia rodar script se aberto', () => {
    expect(validateAttachment({ name: 'x.html', type: 'text/html', size: 100 })).toBe(
      'Tipo de arquivo não permitido.',
    )
  })

  it('recusa SVG, que aceita script embutido', () => {
    expect(validateAttachment({ name: 'logo.svg', type: 'image/svg+xml', size: 100 })).toBe(
      'Tipo de arquivo não permitido.',
    )
  })
})

describe('buildAttachmentPath', () => {
  const lessonId = '11111111-2222-3333-4444-555555555555'

  it('coloca o arquivo dentro da pasta da aula', () => {
    expect(buildAttachmentPath(lessonId, 'manual.pdf')).toMatch(new RegExp(`^${lessonId}/`))
  })

  it('preserva a extensão', () => {
    expect(buildAttachmentPath(lessonId, 'Plano de Mídia.pdf')).toMatch(/\.pdf$/)
  })

  it('normaliza o nome, removendo acento e espaço', () => {
    const caminho = buildAttachmentPath(lessonId, 'Relatório de Métricas.xlsx')
    expect(caminho).toContain('relatorio-de-metricas')
    expect(caminho).not.toContain(' ')
  })

  it('neutraliza tentativa de sair da pasta', () => {
    const caminho = buildAttachmentPath(lessonId, '../../etc/passwd.txt')
    expect(caminho.startsWith(`${lessonId}/`)).toBe(true)
    expect(caminho).not.toContain('..')
  })

  it('gera caminhos diferentes para o mesmo nome', () => {
    const a = buildAttachmentPath(lessonId, 'manual.pdf')
    const b = buildAttachmentPath(lessonId, 'manual.pdf')
    expect(a).not.toBe(b)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- src/lib/storage`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar o validador e o caminho**

Crie `src/lib/storage/attachments.ts`:

```typescript
import { slugify } from '@/lib/slug'

export const ATTACHMENT_BUCKET = 'lesson-attachments'
export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024

/**
 * Tipos aceitos como material de apoio.
 * HTML e SVG ficam de fora de propósito: os dois executam script se abertos
 * no navegador, e o download vem de um domínio nosso.
 */
export const ALLOWED_ATTACHMENT_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/csv': 'csv',
  'text/plain': 'txt',
  'application/zip': 'zip',
  'image/png': 'png',
  'image/jpeg': 'jpg',
}

/** Devolve a mensagem de erro, ou null se o arquivo pode ser enviado. */
export function validateAttachment(file: { name: string; type: string; size: number }): string | null {
  if (file.size <= 0) return 'O arquivo está vazio.'
  if (file.size > MAX_ATTACHMENT_BYTES) return 'O arquivo passa de 50 MB.'
  if (!ALLOWED_ATTACHMENT_MIME[file.type]) return 'Tipo de arquivo não permitido.'
  return null
}

/**
 * Monta o caminho no bucket. O nome enviado pelo usuário nunca entra cru:
 * é normalizado e prefixado pelo id da aula e por um id aleatório, o que
 * elimina travessia de diretório e colisão de nomes.
 */
export function buildAttachmentPath(lessonId: string, fileName: string): string {
  const ponto = fileName.lastIndexOf('.')
  const base = ponto > 0 ? fileName.slice(0, ponto) : fileName
  const extensao = ponto > 0 ? slugify(fileName.slice(ponto + 1)) : ''
  const nome = slugify(base) || 'arquivo'
  const unico = crypto.randomUUID()
  return extensao ? `${lessonId}/${unico}-${nome}.${extensao}` : `${lessonId}/${unico}-${nome}`
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- src/lib/storage`
Expected: PASS — 13 testes.

- [ ] **Step 5: Implementar as server actions de anexo**

Crie `src/server/attachments.ts`:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { canAccessCourse } from '@/lib/access'
import { assertRole } from '@/lib/auth/guards'
import { getCurrentUser } from '@/lib/auth/session'
import {
  ATTACHMENT_BUCKET,
  buildAttachmentPath,
  validateAttachment,
} from '@/lib/storage/attachments'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createServerSupabase } from '@/lib/supabase/server'
import { getLessonForEdit } from './lessons'
import { ok, toActionError, type ActionResult } from './result'

export type AttachmentRow = {
  id: string
  fileName: string
  sizeBytes: number
  mimeType: string
}

/**
 * Anexos de uma aula.
 *
 * Verifica o acesso por conta própria, e não confia em quem chamou: este
 * arquivo é 'use server', então cada export é um endpoint que qualquer pessoa
 * logada pode invocar com o id de aula que quiser.
 */
export async function listAttachments(lessonId: string): Promise<AttachmentRow[]> {
  const user = await getCurrentUser()
  if (!user || user.status !== 'active') return []

  const admin = createAdminSupabase()
  const { data: aula } = await admin
    .from('lessons')
    .select('status, courses(id, area_id, status, is_onboarding)')
    .eq('id', lessonId)
    .maybeSingle()
  if (!aula) return []

  const curso = aula.courses as unknown as {
    id: string
    area_id: string | null
    status: string
    is_onboarding: boolean
  }

  const supabaseUsuario = await createServerSupabase()
  const { data: liberacoes } = await supabaseUsuario
    .from('course_access')
    .select('course_id')
    .eq('user_id', user.id)

  const nivel = canAccessCourse(
    user,
    {
      id: curso.id,
      areaId: curso.area_id,
      status: curso.status as 'draft' | 'published',
      isOnboarding: curso.is_onboarding,
    },
    new Set((liberacoes ?? []).map((l) => l.course_id)),
  )

  // Aula em rascunho: material só para quem gerencia o curso.
  if (nivel === 'none' || (aula.status !== 'published' && nivel !== 'manage')) return []

  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('lesson_attachments')
    .select('id, file_name, size_bytes, mime_type')
    .eq('lesson_id', lessonId)
    .order('created_at')

  return (data ?? []).map((row) => ({
    id: row.id,
    fileName: row.file_name,
    sizeBytes: row.size_bytes,
    mimeType: row.mime_type,
  }))
}

export async function uploadAttachment(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = assertRole(await getCurrentUser(), ['admin', 'leader'])

    const lessonId = z.string().uuid().safeParse(formData.get('lessonId'))
    if (!lessonId.success) return { ok: false, error: 'Aula inválida.' }

    const lesson = await getLessonForEdit(lessonId.data)
    if (!lesson) return { ok: false, error: 'Você não tem permissão para editar esta aula.' }

    const file = formData.get('file')
    if (!(file instanceof File)) return { ok: false, error: 'Escolha um arquivo.' }

    const erro = validateAttachment({ name: file.name, type: file.type, size: file.size })
    if (erro) return { ok: false, error: erro }

    const path = buildAttachmentPath(lessonId.data, file.name)
    const admin = createAdminSupabase()

    const { error: uploadError } = await admin.storage
      .from(ATTACHMENT_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false })
    if (uploadError) throw uploadError

    const { data, error } = await admin
      .from('lesson_attachments')
      .insert({
        lesson_id: lessonId.data,
        file_name: file.name,
        storage_path: path,
        mime_type: file.type,
        size_bytes: file.size,
        uploaded_by: user.id,
      })
      .select('id')
      .single()

    if (error) {
      // Sem a linha no banco o arquivo fica órfão no bucket: remove.
      await admin.storage.from(ATTACHMENT_BUCKET).remove([path])
      throw error
    }

    revalidatePath(`/gerenciar/cursos/${lesson.courseId}/aulas/${lessonId.data}`)
    return ok({ id: data.id })
  } catch (error) {
    return toActionError(error)
  }
}

export async function deleteAttachment(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    assertRole(await getCurrentUser(), ['admin', 'leader'])

    const id = z.string().uuid().safeParse(formData.get('id'))
    if (!id.success) return { ok: false, error: 'Anexo inválido.' }

    const admin = createAdminSupabase()
    const { data: anexo } = await admin
      .from('lesson_attachments')
      .select('id, lesson_id, storage_path')
      .eq('id', id.data)
      .maybeSingle()
    if (!anexo) return { ok: false, error: 'Anexo não encontrado.' }

    const lesson = await getLessonForEdit(anexo.lesson_id)
    if (!lesson) return { ok: false, error: 'Você não tem permissão para excluir este anexo.' }

    await admin.storage.from(ATTACHMENT_BUCKET).remove([anexo.storage_path])
    const { error } = await admin.from('lesson_attachments').delete().eq('id', id.data)
    if (error) throw error

    revalidatePath(`/gerenciar/cursos/${lesson.courseId}/aulas/${anexo.lesson_id}`)
    return ok(null)
  } catch (error) {
    return toActionError(error)
  }
}
```

- [ ] **Step 6: Criar a rota de download assinado**

Crie `src/app/api/anexos/[id]/route.ts`:

```typescript
import { NextResponse, type NextRequest } from 'next/server'
import { canAccessCourse } from '@/lib/access'
import { getCurrentUser } from '@/lib/auth/session'
import { ATTACHMENT_BUCKET } from '@/lib/storage/attachments'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * Entrega o anexo por link assinado de 60 segundos, e só depois de confirmar
 * o acesso ao curso. O bucket é privado: não existe URL pública para nenhum
 * arquivo, e um link copiado deixa de funcionar em um minuto.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 })

  const admin = createAdminSupabase()
  const { data: anexo } = await admin
    .from('lesson_attachments')
    .select('storage_path, lessons(course_id, status, courses(id, area_id, status, is_onboarding))')
    .eq('id', id)
    .maybeSingle()

  if (!anexo) return NextResponse.json({ erro: 'Anexo não encontrado.' }, { status: 404 })

  const aula = anexo.lessons as unknown as {
    status: string
    courses: { id: string; area_id: string | null; status: string; is_onboarding: boolean }
  }
  const curso = aula.courses

  const supabase = await createServerSupabase()
  const { data: liberacoes } = await supabase
    .from('course_access')
    .select('course_id')
    .eq('user_id', user.id)
  const liberados = new Set((liberacoes ?? []).map((l) => l.course_id))

  const nivel = canAccessCourse(
    user,
    {
      id: curso.id,
      areaId: curso.area_id,
      status: curso.status as 'draft' | 'published',
      isOnboarding: curso.is_onboarding,
    },
    liberados,
  )

  // Aula em rascunho só é baixável por quem gerencia o curso.
  if (nivel === 'none' || (aula.status !== 'published' && nivel !== 'manage')) {
    return NextResponse.json({ erro: 'Sem acesso a este material.' }, { status: 403 })
  }

  const { data: assinado, error } = await admin.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(anexo.storage_path, 60)

  if (error || !assinado) {
    return NextResponse.json({ erro: 'Não foi possível gerar o download.' }, { status: 500 })
  }

  return NextResponse.redirect(assinado.signedUrl)
}
```

- [ ] **Step 7: Criar o gerenciador de anexos no editor**

Crie `src/app/(manage)/gerenciar/cursos/[id]/aulas/[lessonId]/attachment-manager.tsx`:

```typescript
'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { ALLOWED_ATTACHMENT_MIME } from '@/lib/storage/attachments'
import { deleteAttachment, uploadAttachment, type AttachmentRow } from '@/server/attachments'

const ACCEPT = Object.keys(ALLOWED_ATTACHMENT_MIME).join(',')

function formatarTamanho(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function AttachmentManager({
  lessonId,
  attachments,
}: {
  lessonId: string
  attachments: AttachmentRow[]
}) {
  const [uploadState, uploadAction, uploading] = useActionState(uploadAttachment, null)
  const [deleteState, deleteAction] = useActionState(deleteAttachment, null)
  const erro = (!uploadState?.ok && uploadState?.error) || (!deleteState?.ok && deleteState?.error)

  return (
    <div className="rounded-card border border-borda bg-superficie p-4">
      <h2 className="mb-3 text-sm font-semibold">Materiais</h2>

      <ul className="mb-4 divide-y divide-borda">
        {attachments.length === 0 && (
          <li className="py-2 text-xs text-texto-suave">Nenhum material anexado.</li>
        )}
        {attachments.map((anexo) => (
          <li key={anexo.id} className="flex items-center gap-2 py-2">
            <span className="flex-1 truncate text-xs">{anexo.fileName}</span>
            <span className="text-xs text-texto-suave">{formatarTamanho(anexo.sizeBytes)}</span>
            <form action={deleteAction}>
              <input type="hidden" name="id" value={anexo.id} />
              <Button type="submit" variant="perigo" className="px-2 py-0.5 text-xs">
                Excluir
              </Button>
            </form>
          </li>
        ))}
      </ul>

      <form action={uploadAction} className="flex flex-col gap-3">
        <input type="hidden" name="lessonId" value={lessonId} />
        <Field label="Novo material" htmlFor="file" hint="Até 50 MB. PDF, Word, Excel, PowerPoint, CSV, ZIP ou imagem.">
          <input id="file" name="file" type="file" required accept={ACCEPT} className="text-xs" />
        </Field>
        {erro && (
          <p role="alert" className="text-xs text-perigo">
            {erro}
          </p>
        )}
        <Button type="submit" variant="secundario" disabled={uploading}>
          {uploading ? 'Enviando…' : 'Anexar'}
        </Button>
      </form>
    </div>
  )
}
```

Acrescente o gerenciador à página de edição da aula, substituindo `src/app/(manage)/gerenciar/cursos/[id]/aulas/[lessonId]/page.tsx`:

```typescript
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { listAttachments } from '@/server/attachments'
import { getLessonForEdit } from '@/server/lessons'
import { AttachmentManager } from './attachment-manager'
import { LessonForm } from './lesson-form'

export default async function EditarAulaPage({
  params,
}: {
  params: Promise<{ id: string; lessonId: string }>
}) {
  const { id, lessonId } = await params
  const lesson = await getLessonForEdit(lessonId)
  if (!lesson || lesson.courseId !== id) notFound()

  const attachments = await listAttachments(lessonId)

  return (
    <div>
      <Link href={`/gerenciar/cursos/${id}`} className="text-xs text-texto-suave hover:underline">
        ← Voltar ao curso
      </Link>
      <h1 className="mb-6 mt-2 text-xl font-semibold">{lesson.title}</h1>
      <LessonForm lesson={lesson} />
      <div className="mt-8 max-w-md">
        <AttachmentManager lessonId={lessonId} attachments={attachments} />
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Rodar tudo**

Run: `npm test && npm run test:db && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(anexos): upload validado em bucket privado com download assinado de 60s"
```

---

### Task 5: Vitrine com cadeado

**Files:**
- Create: `src/server/catalog.ts`
- Create: `src/components/catalog/course-card.tsx`
- Modify: `src/app/(app)/page.tsx`

**Interfaces:**
- Consumes: `canAccessCourse`, `getCurrentUser`, `createServerSupabase`.
- Produces:
  - `type CatalogItem = { id: string; slug: string; title: string; description: string | null; coverUrl: string | null; areaName: string | null; areaColor: string | null; isOnboarding: boolean; lessonCount: number; access: AccessLevel; requestStatus: 'none' | 'pending' }`
  - `type Catalog = { onboarding: CatalogItem | null; grupos: { areaName: string; items: CatalogItem[] }[] }`
  - `getCatalog(): Promise<Catalog>`
  - `<CourseCard item={item} />`

- [ ] **Step 1: Implementar a montagem do catálogo**

Crie `src/server/catalog.ts`:

```typescript
'use server'

import { canAccessCourse, type AccessLevel } from '@/lib/access'
import { getCurrentUser } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'

export type CatalogItem = {
  id: string
  slug: string
  title: string
  description: string | null
  coverUrl: string | null
  areaName: string | null
  areaColor: string | null
  isOnboarding: boolean
  lessonCount: number
  access: AccessLevel
  requestStatus: 'none' | 'pending'
}

export type Catalog = {
  onboarding: CatalogItem | null
  grupos: { areaName: string; items: CatalogItem[] }[]
}

/**
 * Vitrine da empresa inteira.
 *
 * Todo curso publicado aparece, inclusive os que a pessoa não pode abrir — é
 * assim que ela descobre o que existe e pede acesso. O que NUNCA sai daqui é
 * conteúdo: nem aula, nem vídeo, nem anexo. Só capa, título, área, descrição
 * e contagem de aulas.
 */
export async function getCatalog(): Promise<Catalog> {
  const user = await getCurrentUser()
  if (!user || user.status !== 'active') return { onboarding: null, grupos: [] }

  const supabase = await createServerSupabase()

  const [{ data: cursos }, { data: liberacoes }, { data: solicitacoes }] = await Promise.all([
    supabase
      .from('courses')
      .select(
        'id, slug, title, description, cover_url, status, is_onboarding, area_id, position, areas(name, color, position)',
      )
      .eq('status', 'published'),
    supabase.from('course_access').select('course_id').eq('user_id', user.id),
    supabase.from('access_requests').select('course_id').eq('user_id', user.id).eq('status', 'pending'),
  ])

  // A contagem de aulas vem de uma função SECURITY DEFINER, não de um join.
  // RLS é por LINHA: uma política que deixasse contar as aulas de um curso
  // bloqueado deixaria ler o `video_ref` junto — e para vídeo não listado do
  // YouTube o ref é o acesso. A função devolve só o número.
  const { data: contagens } = await supabase.rpc('contar_aulas_publicadas')
  const aulasPorCurso = new Map(
    (contagens ?? []).map((linha) => [linha.course_id, Number(linha.total)]),
  )

  const liberados = new Set((liberacoes ?? []).map((l) => l.course_id))
  const pendentes = new Set((solicitacoes ?? []).map((s) => s.course_id))

  type Linha = {
    id: string
    slug: string
    title: string
    description: string | null
    cover_url: string | null
    status: string
    is_onboarding: boolean
    area_id: string | null
    position: number
    areas: { name: string; color: string | null; position: number } | null
  }

  const items: CatalogItem[] = ((cursos ?? []) as unknown as Linha[]).map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    coverUrl: row.cover_url,
    areaName: row.areas?.name ?? null,
    areaColor: row.areas?.color ?? null,
    isOnboarding: row.is_onboarding,
    lessonCount: aulasPorCurso.get(row.id) ?? 0,
    access: canAccessCourse(
      user,
      {
        id: row.id,
        areaId: row.area_id,
        status: row.status as 'draft' | 'published',
        isOnboarding: row.is_onboarding,
      },
      liberados,
    ),
    requestStatus: pendentes.has(row.id) ? 'pending' : 'none',
  }))

  const onboarding = items.find((i) => i.isOnboarding) ?? null

  const porArea = new Map<string, CatalogItem[]>()
  for (const item of items) {
    if (item.isOnboarding) continue
    const chave = item.areaName ?? 'Outros'
    porArea.set(chave, [...(porArea.get(chave) ?? []), item])
  }

  const grupos = [...porArea.entries()]
    .map(([areaName, lista]) => ({
      areaName,
      items: lista.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')),
    }))
    .sort((a, b) => a.areaName.localeCompare(b.areaName, 'pt-BR'))

  return { onboarding, grupos }
}
```

- [ ] **Step 2: Registrar a função de contagem no arquivo de tipos**

`src/lib/supabase/database.types.ts` é mantido à mão (o gerador exige um runtime
de container indisponível aqui). O `supabase.rpc('contar_aulas_publicadas')` só
compila se a função estiver declarada lá. Acrescente ao bloco `Functions` do
schema `public`:

```typescript
      contar_aulas_publicadas: {
        Args: Record<PropertyKey, never>
        Returns: { course_id: string; total: number }[]
      }
```

Confirme com `npm run typecheck` — sem isso o `rpc()` acusa nome desconhecido.

- [ ] **Step 3: Criar o card do curso**

Crie `src/components/catalog/course-card.tsx`:

```typescript
import Link from 'next/link'
import type { CatalogItem } from '@/server/catalog'

export function CourseCard({ item }: { item: CatalogItem }) {
  const bloqueado = item.access === 'none'

  const capa = (
    <div
      className="relative aspect-video w-full overflow-hidden rounded-card border border-borda bg-fundo"
      style={item.coverUrl ? undefined : { backgroundColor: item.areaColor ?? '#e3e6ea' }}
    >
      {item.coverUrl && (
        // Capa é URL externa informada pelo líder; next/image exigiria allowlist de domínio.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.coverUrl} alt="" className="h-full w-full object-cover" />
      )}
      {bloqueado && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/45">
          <span aria-hidden className="text-2xl">
            🔒
          </span>
          <span className="sr-only">Curso bloqueado</span>
        </div>
      )}
    </div>
  )

  const corpo = (
    <>
      {capa}
      <h3 className="mt-2 text-sm font-medium">{item.title}</h3>
      <p className="text-xs text-texto-suave">
        {item.areaName ?? 'Trilha inicial'} · {item.lessonCount}{' '}
        {item.lessonCount === 1 ? 'aula' : 'aulas'}
        {item.requestStatus === 'pending' && ' · acesso solicitado'}
      </p>
    </>
  )

  return (
    <li>
      <Link
        href={`/curso/${item.slug}`}
        className="block rounded-card focus:outline-none focus:ring-2 focus:ring-marca-500"
      >
        {corpo}
      </Link>
    </li>
  )
}
```

O card bloqueado continua sendo um link: a página do curso mostra a descrição e, na fase 3, o botão de solicitar acesso. Ela é que barra o conteúdo.

- [ ] **Step 4: Montar a home**

Substitua `src/app/(app)/page.tsx`:

```typescript
import { CourseCard } from '@/components/catalog/course-card'
import { getCurrentUser } from '@/lib/auth/session'
import { getCatalog } from '@/server/catalog'

export const metadata = { title: 'Início — GEX Academy' }

export default async function HomePage() {
  const [user, catalog] = await Promise.all([getCurrentUser(), getCatalog()])

  return (
    <div className="flex flex-col gap-10">
      <header>
        <h1 className="text-xl font-semibold">Olá, {user!.fullName.split(' ')[0]}</h1>
      </header>

      {catalog.onboarding && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-texto-suave">
            Comece por aqui
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <CourseCard item={catalog.onboarding} />
          </ul>
        </section>
      )}

      {catalog.grupos.map((grupo) => (
        <section key={grupo.areaName}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-texto-suave">
            {grupo.areaName}
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {grupo.items.map((item) => (
              <CourseCard key={item.id} item={item} />
            ))}
          </ul>
        </section>
      ))}

      {!catalog.onboarding && catalog.grupos.length === 0 && (
        <p className="text-sm text-texto-suave">
          Nenhum curso publicado ainda. Assim que os líderes publicarem, eles aparecem aqui.
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Rodar tudo**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(vitrine): catalogo da empresa com cadeado nos cursos sem acesso"
```

---

### Task 6: Página do curso e página da aula

**Files:**
- Create: `src/server/viewer.ts`
- Create: `src/app/(app)/curso/[slug]/page.tsx`
- Create: `src/app/(app)/curso/[slug]/aula/[lessonSlug]/page.tsx`
- Create: `src/components/catalog/locked-course.tsx`

**Interfaces:**
- Consumes: `canAccessCourse`, `getCurrentUser`, `listAttachments`, `VideoPlayer`, `formatDuration`.
- Produces:
  - `type CourseView = { id: string; slug: string; title: string; description: string | null; coverUrl: string | null; areaName: string | null; isOnboarding: boolean; access: AccessLevel; lessons: { id: string; slug: string; title: string; durationSeconds: number | null }[] }`
  - `getCourseView(slug: string): Promise<CourseView | null>`
  - `type LessonView = { course: CourseView; lesson: { id: string; slug: string; title: string; description: string | null; provider: VideoProvider; ref: string; durationSeconds: number | null }; anterior: string | null; proxima: string | null }`
  - `getLessonView(courseSlug: string, lessonSlug: string): Promise<LessonView | null>`

- [ ] **Step 1: Implementar as consultas do aluno**

Crie `src/server/viewer.ts`:

```typescript
'use server'

import { canAccessCourse, type AccessLevel } from '@/lib/access'
import { getCurrentUser } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import type { VideoProvider } from '@/lib/video'

export type CourseView = {
  id: string
  slug: string
  title: string
  description: string | null
  coverUrl: string | null
  areaName: string | null
  isOnboarding: boolean
  access: AccessLevel
  lessons: { id: string; slug: string; title: string; durationSeconds: number | null }[]
}

export type LessonView = {
  course: CourseView
  lesson: {
    id: string
    slug: string
    title: string
    description: string | null
    provider: VideoProvider
    ref: string
    durationSeconds: number | null
  }
  anterior: string | null
  proxima: string | null
}

/**
 * Carrega um curso para o aluno.
 *
 * Quando o acesso é 'none', devolve os metadados (para a tela do cadeado) mas
 * com `lessons` vazio. A lista de aulas já é conteúdo.
 */
export async function getCourseView(slug: string): Promise<CourseView | null> {
  const user = await getCurrentUser()
  if (!user || user.status !== 'active') return null

  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('courses')
    .select(
      'id, slug, title, description, cover_url, status, is_onboarding, area_id, areas(name), lessons(id, slug, title, duration_seconds, status, position)',
    )
    .eq('slug', slug)
    .maybeSingle()

  if (!data) return null

  const row = data as unknown as {
    id: string
    slug: string
    title: string
    description: string | null
    cover_url: string | null
    status: string
    is_onboarding: boolean
    area_id: string | null
    areas: { name: string } | null
    lessons: {
      id: string
      slug: string
      title: string
      duration_seconds: number | null
      status: string
      position: number
    }[]
  }

  const { data: liberacoes } = await supabase
    .from('course_access')
    .select('course_id')
    .eq('user_id', user.id)

  const access = canAccessCourse(
    user,
    {
      id: row.id,
      areaId: row.area_id,
      status: row.status as 'draft' | 'published',
      isOnboarding: row.is_onboarding,
    },
    new Set((liberacoes ?? []).map((l) => l.course_id)),
  )

  // Rascunho é invisível para quem não gerencia — nem a capa aparece.
  if (row.status !== 'published' && access !== 'manage') return null

  const lessons =
    access === 'none'
      ? []
      : row.lessons
          .filter((l) => l.status === 'published' || access === 'manage')
          .sort((a, b) => a.position - b.position)
          .map((l) => ({
            id: l.id,
            slug: l.slug,
            title: l.title,
            durationSeconds: l.duration_seconds,
          }))

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    coverUrl: row.cover_url,
    areaName: row.areas?.name ?? null,
    isOnboarding: row.is_onboarding,
    access,
    lessons,
  }
}

export async function getLessonView(
  courseSlug: string,
  lessonSlug: string,
): Promise<LessonView | null> {
  const course = await getCourseView(courseSlug)
  if (!course || course.access === 'none') return null

  const indice = course.lessons.findIndex((l) => l.slug === lessonSlug)
  if (indice === -1) return null

  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('lessons')
    .select('id, slug, title, description, video_provider, video_ref, duration_seconds')
    .eq('course_id', course.id)
    .eq('slug', lessonSlug)
    .maybeSingle()

  if (!data) return null

  return {
    course,
    lesson: {
      id: data.id,
      slug: data.slug,
      title: data.title,
      description: data.description,
      provider: data.video_provider as VideoProvider,
      ref: data.video_ref,
      durationSeconds: data.duration_seconds,
    },
    anterior: indice > 0 ? course.lessons[indice - 1].slug : null,
    proxima: indice < course.lessons.length - 1 ? course.lessons[indice + 1].slug : null,
  }
}
```

- [ ] **Step 2: Criar a tela do curso bloqueado**

Crie `src/components/catalog/locked-course.tsx`:

```typescript
import type { CourseView } from '@/server/viewer'

export function LockedCourse({ course }: { course: CourseView }) {
  return (
    <div className="mx-auto max-w-lg rounded-card border border-borda bg-superficie p-8 text-center">
      <span aria-hidden className="text-3xl">
        🔒
      </span>
      <h1 className="mt-3 text-lg font-semibold">{course.title}</h1>
      <p className="mt-1 text-xs text-texto-suave">{course.areaName ?? 'Trilha inicial'}</p>
      {course.description && <p className="mt-4 text-sm text-texto-suave">{course.description}</p>}
      <p className="mt-6 text-sm text-texto-suave">
        Você ainda não tem acesso a este curso.
      </p>
    </div>
  )
}
```

O botão *Solicitar acesso* entra aqui na fase 3, junto com a fila do admin.

- [ ] **Step 3: Criar a página do curso**

Crie `src/app/(app)/curso/[slug]/page.tsx`:

```typescript
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { LockedCourse } from '@/components/catalog/locked-course'
import { formatDuration } from '@/lib/format'
import { getCourseView } from '@/server/viewer'

export default async function CursoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const course = await getCourseView(slug)
  if (!course) notFound()

  if (course.access === 'none') return <LockedCourse course={course} />

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-semibold">{course.title}</h1>
      <p className="mt-1 text-xs text-texto-suave">
        {course.areaName ?? 'Trilha inicial'} · {course.lessons.length}{' '}
        {course.lessons.length === 1 ? 'aula' : 'aulas'}
      </p>
      {course.description && <p className="mt-4 text-sm text-texto-suave">{course.description}</p>}

      <ol className="mt-8 divide-y divide-borda rounded-card border border-borda bg-superficie">
        {course.lessons.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-texto-suave">
            Este curso ainda não tem aulas publicadas.
          </li>
        )}
        {course.lessons.map((lesson, indice) => (
          <li key={lesson.id}>
            <Link
              href={`/curso/${course.slug}/aula/${lesson.slug}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-fundo"
            >
              <span className="w-6 text-xs text-texto-suave">{indice + 1}</span>
              <span className="flex-1 text-sm">{lesson.title}</span>
              <span className="text-xs text-texto-suave">
                {formatDuration(lesson.durationSeconds)}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  )
}
```

- [ ] **Step 4: Criar a página da aula**

Crie `src/app/(app)/curso/[slug]/aula/[lessonSlug]/page.tsx`:

```typescript
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { VideoPlayer } from '@/components/video/video-player'
import { listAttachments } from '@/server/attachments'
import { getLessonView } from '@/server/viewer'

function formatarTamanho(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default async function AulaPage({
  params,
}: {
  params: Promise<{ slug: string; lessonSlug: string }>
}) {
  const { slug, lessonSlug } = await params
  const view = await getLessonView(slug, lessonSlug)
  if (!view) notFound()

  const { course, lesson, anterior, proxima } = view
  const attachments = await listAttachments(lesson.id)

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/curso/${course.slug}`} className="text-xs text-texto-suave hover:underline">
        ← {course.title}
      </Link>

      <h1 className="mb-4 mt-2 text-xl font-semibold">{lesson.title}</h1>

      <VideoPlayer provider={lesson.provider} videoRef={lesson.ref} title={lesson.title} />

      {lesson.description && (
        // Texto puro: `whitespace-pre-line` preserva as quebras sem interpretar marcação.
        <p className="mt-6 whitespace-pre-line text-sm text-texto-suave">{lesson.description}</p>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold">Materiais</h2>
        {attachments.length === 0 ? (
          <p className="text-xs text-texto-suave">Esta aula não tem material de apoio.</p>
        ) : (
          <ul className="divide-y divide-borda rounded-card border border-borda bg-superficie">
            {attachments.map((anexo) => (
              <li key={anexo.id} className="flex items-center gap-3 px-4 py-2">
                <a
                  href={`/api/anexos/${anexo.id}`}
                  className="flex-1 truncate text-sm text-marca-600 hover:underline"
                >
                  {anexo.fileName}
                </a>
                <span className="text-xs text-texto-suave">{formatarTamanho(anexo.sizeBytes)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <nav className="mt-8 flex items-center justify-between border-t border-borda pt-4">
        {anterior ? (
          <Link href={`/curso/${course.slug}/aula/${anterior}`} className="text-sm text-marca-600 hover:underline">
            ← Aula anterior
          </Link>
        ) : (
          <span />
        )}
        {proxima && (
          <Link href={`/curso/${course.slug}/aula/${proxima}`} className="text-sm text-marca-600 hover:underline">
            Próxima aula →
          </Link>
        )}
      </nav>
    </div>
  )
}
```

O botão *Marcar como concluída* entra na fase 3, junto com o progresso.

- [ ] **Step 5: Rodar tudo**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(aluno): pagina do curso, pagina da aula com player e materiais"
```

---

### Task 7: Políticas RLS e o teste de bloqueio ponta a ponta

Até aqui a autorização vive só na aplicação. Esta tarefa põe a mesma regra dentro do Postgres, para que um erro de programação futuro deixe de ser um vazamento.

**Files:**
- Create: `supabase/migrations/0003_politicas_rls.sql`
- Create: `e2e/acesso-bloqueado.spec.ts`
- Create: `tests/db/rls.test.ts`

**Interfaces:**
- Consumes: o schema da fase 1.
- Produces: funções SQL `public.auth_profile_role()`, `public.auth_profile_area()`, `public.auth_is_active()`, `public.can_access_course(uuid)`, `public.can_manage_course(uuid)` e as políticas de todas as tabelas.

- [ ] **Step 1: Escrever a migration de políticas**

Crie `supabase/migrations/0003_politicas_rls.sql`:

```sql
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
```

- [ ] **Step 2: Aplicar e regenerar os tipos**

```bash
npm run db:push
npm run db:types
```

Expected: migration aplicada sem erro.

- [ ] **Step 3: Escrever o teste de RLS com sessões reais**

Crie `tests/db/rls.test.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '@/lib/supabase/database.types'
import { adminClient, createTestUser } from './client'

const db = adminClient()

/** Cliente autenticado como a pessoa informada: sujeito às políticas RLS. */
async function clienteDe(email: string) {
  const cliente = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { error } = await cliente.auth.signInWithPassword({
    email,
    password: 'senha-de-teste-123',
  })
  if (error) throw error
  return cliente
}

let cursoTrafego: string
let aulaTrafego: string
let emailDesigner: string
let emailTrafego: string
let emailLiderTrafego: string

beforeAll(async () => {
  const stamp = Date.now()

  const { data: areas } = await db
    .from('areas')
    .insert([
      { name: 'Tráfego', slug: `trafego-rls-${stamp}` },
      { name: 'Design', slug: `design-rls-${stamp}` },
    ])
    .select('id, slug')

  const areaTrafego = areas!.find((a) => a.slug.startsWith('trafego'))!.id
  const areaDesign = areas!.find((a) => a.slug.startsWith('design'))!.id

  emailLiderTrafego = `lider-t-${stamp}@gexcorp.com.br`
  emailTrafego = `aluno-t-${stamp}@gexcorp.com.br`
  emailDesigner = `aluno-d-${stamp}@gexcorp.com.br`

  const liderId = await createTestUser({
    email: emailLiderTrafego,
    fullName: 'Líder Tráfego',
    role: 'leader',
    areaId: areaTrafego,
  })
  await createTestUser({
    email: emailTrafego,
    fullName: 'Aluno Tráfego',
    role: 'member',
    areaId: areaTrafego,
  })
  await createTestUser({
    email: emailDesigner,
    fullName: 'Aluno Design',
    role: 'member',
    areaId: areaDesign,
  })

  const { data: curso } = await db
    .from('courses')
    .insert({
      title: 'Meta Ads',
      slug: `meta-ads-${stamp}`,
      area_id: areaTrafego,
      owner_id: liderId,
      status: 'published',
    })
    .select('id')
    .single()
  cursoTrafego = curso!.id

  const { data: aula } = await db
    .from('lessons')
    .insert({
      course_id: cursoTrafego,
      title: 'Estrutura de campanha',
      slug: 'estrutura',
      video_provider: 'youtube',
      video_ref: 'dQw4w9WgXcQ',
      status: 'published',
    })
    .select('id')
    .single()
  aulaTrafego = aula!.id

  await db.from('lesson_attachments').insert({
    lesson_id: aulaTrafego,
    file_name: 'planilha.xlsx',
    storage_path: `${aulaTrafego}/teste.xlsx`,
    mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size_bytes: 100,
    uploaded_by: liderId,
  })
})

describe('RLS — a vitrine mostra, o conteúdo não', () => {
  it('designer enxerga o curso de tráfego na vitrine', async () => {
    const cliente = await clienteDe(emailDesigner)
    const { data } = await cliente.from('courses').select('id').eq('id', cursoTrafego)
    expect(data).toHaveLength(1)
  })

  it('designer NÃO enxerga os anexos do curso de tráfego', async () => {
    const cliente = await clienteDe(emailDesigner)
    const { data } = await cliente.from('lesson_attachments').select('id').eq('lesson_id', aulaTrafego)
    expect(data).toEqual([])
  })

  it('designer NÃO enxerga o fórum do curso de tráfego', async () => {
    const cliente = await clienteDe(emailDesigner)
    const { error } = await cliente.from('questions').insert({
      lesson_id: aulaTrafego,
      author_id: (await cliente.auth.getUser()).data.user!.id,
      body: 'Consigo perguntar aqui?',
    })
    expect(error).not.toBeNull()
  })

  it('aluno de tráfego enxerga os anexos da própria área', async () => {
    const cliente = await clienteDe(emailTrafego)
    const { data } = await cliente.from('lesson_attachments').select('id').eq('lesson_id', aulaTrafego)
    expect(data).toHaveLength(1)
  })

  it('designer passa a enxergar os anexos depois da liberação individual', async () => {
    const cliente = await clienteDe(emailDesigner)
    const userId = (await cliente.auth.getUser()).data.user!.id

    await db.from('course_access').insert({
      user_id: userId,
      course_id: cursoTrafego,
      granted_by: userId,
    })

    const { data } = await cliente.from('lesson_attachments').select('id').eq('lesson_id', aulaTrafego)
    expect(data).toHaveLength(1)
  })

  it('aluno não consegue editar curso de área nenhuma', async () => {
    const cliente = await clienteDe(emailTrafego)
    const { error } = await cliente
      .from('courses')
      .update({ title: 'Invadido' })
      .eq('id', cursoTrafego)
      .select('id')
      .maybeSingle()
    const { data } = await db.from('courses').select('title').eq('id', cursoTrafego).single()
    expect(data!.title).toBe('Meta Ads')
    expect(error === null || error !== null).toBe(true)
  })

  it('líder de tráfego edita o próprio curso', async () => {
    const cliente = await clienteDe(emailLiderTrafego)
    const { error } = await cliente
      .from('courses')
      .update({ description: 'Curso completo de Meta Ads.' })
      .eq('id', cursoTrafego)
    expect(error).toBeNull()

    const { data } = await db.from('courses').select('description').eq('id', cursoTrafego).single()
    expect(data!.description).toBe('Curso completo de Meta Ads.')
  })
})
```

- [ ] **Step 4: Escrever o E2E do bloqueio**

Crie `e2e/acesso-bloqueado.spec.ts`:

```typescript
import { expect, test } from '@playwright/test'
import { adminClient, criarAreaDeTeste, criarUsuarioDeTeste } from './helpers'

async function entrar(page: import('@playwright/test').Page, email: string) {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill('senha-de-teste-123')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL('/')
}

test('colaborador de outra área vê a capa, mas não alcança o conteúdo', async ({ page }) => {
  const db = adminClient()
  const stamp = Date.now()

  const areaTrafego = await criarAreaDeTeste('Trafego')
  const areaDesign = await criarAreaDeTeste('Designn')

  const liderId = await criarUsuarioDeTeste({
    email: `lider-b-${stamp}@gexcorp.com.br`,
    senha: 'senha-de-teste-123',
    fullName: 'Líder Tráfego',
    role: 'leader',
    areaId: areaTrafego,
  })
  const emailDesigner = `designer-b-${stamp}@gexcorp.com.br`
  await criarUsuarioDeTeste({
    email: emailDesigner,
    senha: 'senha-de-teste-123',
    fullName: 'Designer Curioso',
    role: 'member',
    areaId: areaDesign,
  })

  const slugCurso = `escala-de-campanhas-${stamp}`
  const { data: curso } = await db
    .from('courses')
    .insert({
      title: 'Escala de Campanhas',
      slug: slugCurso,
      description: 'Como escalar sem quebrar o ROI.',
      area_id: areaTrafego,
      owner_id: liderId,
      status: 'published',
    })
    .select('id')
    .single()

  await db.from('lessons').insert({
    course_id: curso!.id,
    title: 'Orçamento por conjunto',
    slug: 'orcamento',
    video_provider: 'youtube',
    video_ref: 'dQw4w9WgXcQ',
    status: 'published',
  })

  await entrar(page, emailDesigner)

  // A capa aparece na vitrine, com cadeado.
  await expect(page.getByText('Escala de Campanhas')).toBeVisible()
  await expect(page.getByText('Curso bloqueado')).toBeAttached()

  // A página do curso mostra a descrição, mas nenhuma aula.
  await page.goto(`/curso/${slugCurso}`)
  await expect(page.getByText('Como escalar sem quebrar o ROI.')).toBeVisible()
  await expect(page.getByText('Você ainda não tem acesso a este curso.')).toBeVisible()
  await expect(page.getByText('Orçamento por conjunto')).toHaveCount(0)

  // A URL direta da aula também não abre.
  await page.goto(`/curso/${slugCurso}/aula/orcamento`)
  await expect(page.getByText('Orçamento por conjunto')).toHaveCount(0)
})

test('colaborador da área abre o curso e a aula normalmente', async ({ page }) => {
  const db = adminClient()
  const stamp = Date.now()

  const areaCopy = await criarAreaDeTeste('Copyy')
  const liderId = await criarUsuarioDeTeste({
    email: `lider-c-${stamp}@gexcorp.com.br`,
    senha: 'senha-de-teste-123',
    fullName: 'Líder Copy',
    role: 'leader',
    areaId: areaCopy,
  })
  const emailAluno = `redator-${stamp}@gexcorp.com.br`
  await criarUsuarioDeTeste({
    email: emailAluno,
    senha: 'senha-de-teste-123',
    fullName: 'Redator Junior',
    role: 'member',
    areaId: areaCopy,
  })

  const slugCurso = `headlines-${stamp}`
  const { data: curso } = await db
    .from('courses')
    .insert({
      title: 'Headlines que Convertem',
      slug: slugCurso,
      area_id: areaCopy,
      owner_id: liderId,
      status: 'published',
    })
    .select('id')
    .single()

  await db.from('lessons').insert({
    course_id: curso!.id,
    title: 'Anatomia de uma headline',
    slug: 'anatomia',
    video_provider: 'youtube',
    video_ref: 'dQw4w9WgXcQ',
    status: 'published',
  })

  await entrar(page, emailAluno)

  await page.getByText('Headlines que Convertem').click()
  await expect(page.getByRole('heading', { name: 'Headlines que Convertem' })).toBeVisible()

  await page.getByText('Anatomia de uma headline').click()
  await expect(page.getByRole('heading', { name: 'Anatomia de uma headline' })).toBeVisible()
  await expect(page.locator('iframe[src*="youtube-nocookie.com"]')).toBeVisible()
})
```

- [ ] **Step 5: Rodar a suíte completa**

```bash
npm run db:reset
npm test
npm run test:db
npm run build
npm run test:e2e
```

Expected: PASS em todas as etapas.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(rls): politicas espelhando a regra de acesso e E2E de bloqueio"
```

---

## Encerramento da Fase 2

O líder publica curso e aula com vídeo e material; o colaborador vê a vitrine inteira, entra no que tem acesso e encontra cadeado no resto — com o bloqueio garantido pela aplicação **e** pelo banco. A fase 3 acrescenta a interação: progresso, fórum de dúvidas, solicitação de acesso, e-mails e o painel de acompanhamento.
