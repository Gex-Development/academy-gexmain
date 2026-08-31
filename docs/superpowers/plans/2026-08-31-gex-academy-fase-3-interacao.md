# GEX Academy — Fase 3: Interação e Publicação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar o MVP: o aluno marca aulas como concluídas e pergunta no fórum, o líder responde pela fila de dúvidas, o admin decide solicitações de acesso e acompanha o progresso — com e-mail avisando cada lado — e a plataforma vai ao ar em `academy.gexcorp.com.br`.

**Architecture:** Continuação das fases 1 e 2. As decisões que dependem de tempo e de contagem (limite de publicações no fórum, percentual de progresso) ficam em funções puras testadas; o envio de e-mail é um efeito colateral isolado que nunca derruba a ação principal.

**Tech Stack:** Next.js 16, TypeScript, Tailwind CSS v4, Supabase, Resend, Zod, Vitest, Playwright, Vercel.

**Spec:** `docs/superpowers/specs/2026-08-31-gex-academy-design.md`

**Pré-requisito:** Fases 1 e 2 concluídas.

## Global Constraints

- Next.js **16**: middleware é `src/proxy.ts` exportando `proxy`.
- `@supabase/ssr` com `getAll`/`setAll` apenas.
- `SUPABASE_SERVICE_ROLE_KEY` e `RESEND_API_KEY` nunca com prefixo `NEXT_PUBLIC_`.
- Nenhum componente de tela chama o Supabase direto — tudo por `src/server/`.
- Toda server action valida com Zod, verifica papel **e** verifica acesso ao recurso específico. Devolve `ActionResult<T>`.
- **Nenhum HTML fornecido por usuário é renderizado.** No corpo dos e-mails, todo texto de usuário passa por `escapeHtml`.
- Fórum: no máximo **4000 caracteres** por publicação e **10 publicações a cada 5 minutos** por pessoa.
- Falha no envio de e-mail **nunca** derruba a ação principal: registra no log e segue.
- RLS habilitado em todas as tabelas.
- Interface em pt-BR, fuso `America/Sao_Paulo`. TypeScript `strict`, sem `any`.

---

### Task 1: Progresso do aluno

**Files:**
- Create: `src/lib/progress/percent.ts`
- Create: `src/server/progress.ts`
- Create: `src/components/progress/progress-bar.tsx`
- Create: `src/components/progress/complete-button.tsx`
- Modify: `src/server/catalog.ts`
- Modify: `src/server/viewer.ts`
- Modify: `src/app/(app)/curso/[slug]/page.tsx`
- Modify: `src/app/(app)/curso/[slug]/aula/[lessonSlug]/page.tsx`
- Modify: `src/app/(app)/page.tsx`
- Modify: `src/components/catalog/course-card.tsx`
- Test: `src/lib/progress/percent.test.ts`

**Interfaces:**
- Consumes: `getCurrentUser`, `getCourseView`, `getLessonView`, `ActionResult`.
- Produces:
  - `progressPercent(completed: number, total: number): number`
  - `type CourseProgress = { completed: number; total: number; percent: number }` e `buildProgress(completed, total): CourseProgress`, ambos em `src/lib/progress/percent.ts`
  - `getCompletedLessonIds(courseId: string): Promise<Set<string>>`
  - `toggleLessonComplete(_prev, formData): Promise<ActionResult<{ completed: boolean }>>`
  - `getContinueWatching(): Promise<{ courseSlug: string; courseTitle: string; lessonSlug: string; lessonTitle: string } | null>`
  - `<ProgressBar completed total />`, `<CompleteButton lessonId completed />`
  - `CatalogItem` ganha o campo `progress: CourseProgress`.

- [ ] **Step 1: Escrever o teste que falha do percentual**

Crie `src/lib/progress/percent.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { progressPercent } from './percent'

describe('progressPercent', () => {
  it('devolve 0 quando o curso não tem aulas', () => {
    expect(progressPercent(0, 0)).toBe(0)
  })

  it('devolve 0 quando nada foi concluído', () => {
    expect(progressPercent(0, 8)).toBe(0)
  })

  it('devolve 100 quando tudo foi concluído', () => {
    expect(progressPercent(8, 8)).toBe(100)
  })

  it('arredonda para o inteiro mais próximo', () => {
    expect(progressPercent(1, 3)).toBe(33)
    expect(progressPercent(2, 3)).toBe(67)
  })

  it('nunca passa de 100, mesmo com aula concluída que saiu do curso', () => {
    expect(progressPercent(9, 8)).toBe(100)
  })

  it('nunca fica negativo', () => {
    expect(progressPercent(-1, 8)).toBe(0)
  })
})
```

O quinto caso é real: o aluno conclui uma aula, o líder depois a despublica, e a contagem de concluídas passa o total.

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- src/lib/progress`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar o percentual**

Crie `src/lib/progress/percent.ts`:

```typescript
export type CourseProgress = { completed: number; total: number; percent: number }

/** Percentual de conclusão, sempre entre 0 e 100. */
export function progressPercent(completed: number, total: number): number {
  if (total <= 0 || completed <= 0) return 0
  return Math.min(100, Math.round((completed / total) * 100))
}

/**
 * Empacota contagem e percentual.
 * Mora aqui, e não em `src/server/progress.ts`, porque todo export de um
 * arquivo 'use server' precisa ser função async — e esta é síncrona.
 */
export function buildProgress(completed: number, total: number): CourseProgress {
  return { completed, total, percent: progressPercent(completed, total) }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- src/lib/progress`
Expected: PASS — 6 testes.

- [ ] **Step 5: Implementar as server actions de progresso**

Crie `src/server/progress.ts`:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { ok, toActionError, type ActionResult } from './result'
import { getCourseView } from './viewer'

/** Ids das aulas que a pessoa já concluiu dentro de um curso. */
export async function getCompletedLessonIds(courseId: string): Promise<Set<string>> {
  const user = await getCurrentUser()
  if (!user) return new Set()

  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('lesson_progress')
    .select('lesson_id, lessons!inner(course_id)')
    .eq('user_id', user.id)
    .eq('lessons.course_id', courseId)

  return new Set((data ?? []).map((row) => row.lesson_id))
}

export async function toggleLessonComplete(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ completed: boolean }>> {
  try {
    const user = await getCurrentUser()
    if (!user || user.status !== 'active') return { ok: false, error: 'Faça login para continuar.' }

    const parsed = z
      .object({ lessonId: z.string().uuid(), courseSlug: z.string().min(1) })
      .safeParse(Object.fromEntries(formData))
    if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }

    // Confirma que a pessoa realmente tem acesso a esta aula antes de registrar.
    const course = await getCourseView(parsed.data.courseSlug)
    if (!course || course.access === 'none') {
      return { ok: false, error: 'Você não tem acesso a esta aula.' }
    }
    if (!course.lessons.some((l) => l.id === parsed.data.lessonId)) {
      return { ok: false, error: 'Aula não encontrada neste curso.' }
    }

    const supabase = await createServerSupabase()
    const { data: existente } = await supabase
      .from('lesson_progress')
      .select('lesson_id')
      .eq('user_id', user.id)
      .eq('lesson_id', parsed.data.lessonId)
      .maybeSingle()

    if (existente) {
      const { error } = await supabase
        .from('lesson_progress')
        .delete()
        .eq('user_id', user.id)
        .eq('lesson_id', parsed.data.lessonId)
      if (error) throw error
    } else {
      const { error } = await supabase
        .from('lesson_progress')
        .insert({ user_id: user.id, lesson_id: parsed.data.lessonId })
      if (error) throw error
    }

    revalidatePath('/')
    revalidatePath(`/curso/${parsed.data.courseSlug}`)
    return ok({ completed: !existente })
  } catch (error) {
    return toActionError(error)
  }
}

/** A próxima aula não concluída do curso mais recentemente tocado pela pessoa. */
export async function getContinueWatching(): Promise<{
  courseSlug: string
  courseTitle: string
  lessonSlug: string
  lessonTitle: string
} | null> {
  const user = await getCurrentUser()
  if (!user || user.status !== 'active') return null

  const supabase = await createServerSupabase()
  const { data: ultima } = await supabase
    .from('lesson_progress')
    .select('completed_at, lessons!inner(course_id, courses!inner(slug))')
    .eq('user_id', user.id)
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!ultima) return null

  const slug = (ultima.lessons as unknown as { courses: { slug: string } }).courses.slug
  const course = await getCourseView(slug)
  if (!course || course.access === 'none') return null

  const concluidas = await getCompletedLessonIds(course.id)
  const proxima = course.lessons.find((l) => !concluidas.has(l.id))
  if (!proxima) return null

  return {
    courseSlug: course.slug,
    courseTitle: course.title,
    lessonSlug: proxima.slug,
    lessonTitle: proxima.title,
  }
}
```

- [ ] **Step 6: Criar os componentes de progresso**

Crie `src/components/progress/progress-bar.tsx`:

```typescript
import { progressPercent } from '@/lib/progress/percent'

export function ProgressBar({ completed, total }: { completed: number; total: number }) {
  const percent = progressPercent(completed, total)

  return (
    <div>
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${percent}% concluído`}
        className="h-1.5 w-full overflow-hidden rounded-full bg-borda"
      >
        <div className="h-full bg-marca-500" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-1 text-xs text-texto-suave">
        {completed} de {total} {total === 1 ? 'aula concluída' : 'aulas concluídas'} · {percent}%
      </p>
    </div>
  )
}
```

Crie `src/components/progress/complete-button.tsx`:

```typescript
'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { toggleLessonComplete } from '@/server/progress'

export function CompleteButton({
  lessonId,
  courseSlug,
  completed,
}: {
  lessonId: string
  courseSlug: string
  completed: boolean
}) {
  const [state, action, pending] = useActionState(toggleLessonComplete, null)
  const concluida = state?.ok ? state.data.completed : completed

  return (
    <form action={action}>
      <input type="hidden" name="lessonId" value={lessonId} />
      <input type="hidden" name="courseSlug" value={courseSlug} />
      <Button type="submit" variant={concluida ? 'secundario' : 'primario'} disabled={pending}>
        {concluida ? '✓ Aula concluída' : 'Marcar como concluída'}
      </Button>
      {state && !state.ok && (
        <p role="alert" className="mt-1 text-xs text-perigo">
          {state.error}
        </p>
      )}
    </form>
  )
}
```

- [ ] **Step 7: Ligar o progresso às telas existentes**

Em `src/server/catalog.ts`, acrescente o progresso ao tipo e à montagem:

```typescript
// no topo do arquivo
import { buildProgress, type CourseProgress } from '@/lib/progress/percent'

// no tipo CatalogItem, acrescente:
//   progress: CourseProgress

// dentro de getCatalog, some ao Promise.all existente:
const { data: concluidas } = await supabase
  .from('lesson_progress')
  .select('lesson_id, lessons!inner(course_id)')
  .eq('user_id', user.id)

const concluidasPorCurso = new Map<string, number>()
for (const linha of concluidas ?? []) {
  const cursoId = (linha.lessons as unknown as { course_id: string }).course_id
  concluidasPorCurso.set(cursoId, (concluidasPorCurso.get(cursoId) ?? 0) + 1)
}

// e no map que monta cada CatalogItem, acrescente o campo:
//   progress: buildProgress(
//     concluidasPorCurso.get(row.id) ?? 0,
//     row.lessons.filter((l) => l.status === 'published').length,
//   ),
```

Em `src/components/catalog/course-card.tsx`, acrescente a barra abaixo do parágrafo de metadados, visível só quando a pessoa tem acesso e o curso tem aulas:

```typescript
{item.access !== 'none' && item.progress.total > 0 && (
  <div className="mt-2">
    <ProgressBar completed={item.progress.completed} total={item.progress.total} />
  </div>
)}
```

acrescentando `import { ProgressBar } from '@/components/progress/progress-bar'` no topo.

Em `src/app/(app)/page.tsx`, acrescente o bloco "Continue de onde parou" logo abaixo do `<header>`:

```typescript
{continuar && (
  <section>
    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-texto-suave">
      Continue de onde parou
    </h2>
    <Link
      href={`/curso/${continuar.courseSlug}/aula/${continuar.lessonSlug}`}
      className="block rounded-card border border-borda bg-superficie p-4 hover:bg-fundo"
    >
      <p className="text-sm font-medium">{continuar.lessonTitle}</p>
      <p className="text-xs text-texto-suave">{continuar.courseTitle}</p>
    </Link>
  </section>
)}
```

carregando `continuar` no `Promise.all` do início da página:

```typescript
const [user, catalog, continuar] = await Promise.all([
  getCurrentUser(),
  getCatalog(),
  getContinueWatching(),
])
```

com `import Link from 'next/link'` e `import { getContinueWatching } from '@/server/progress'`.

Em `src/app/(app)/curso/[slug]/page.tsx`, carregue as concluídas e marque na lista:

```typescript
const concluidas = await getCompletedLessonIds(course.id)
```

acrescentando `<ProgressBar completed={concluidas.size} total={course.lessons.length} />` abaixo da descrição, e dentro de cada `<li>` da lista de aulas, antes do título:

```typescript
<span aria-hidden className="w-4 text-sucesso">{concluidas.has(lesson.id) ? '✓' : ''}</span>
```

Em `src/app/(app)/curso/[slug]/aula/[lessonSlug]/page.tsx`, acrescente o botão de conclusão logo abaixo do player:

```typescript
const concluidas = await getCompletedLessonIds(course.id)

// abaixo do <VideoPlayer />:
<div className="mt-4">
  <CompleteButton
    lessonId={lesson.id}
    courseSlug={course.slug}
    completed={concluidas.has(lesson.id)}
  />
</div>
```

- [ ] **Step 8: Rodar tudo**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(progresso): conclusao de aula, barra de progresso e continue de onde parou"
```

---

### Task 2: Envio de e-mail

**Files:**
- Create: `src/lib/email/escape.ts`
- Create: `src/lib/email/templates.ts`
- Create: `src/lib/email/send.ts`
- Create: `src/lib/email/index.ts`
- Test: `src/lib/email/templates.test.ts`

**Interfaces:**
- Consumes: nada além de variáveis de ambiente.
- Produces:
  - `escapeHtml(text: string): string`
  - `type EmailContent = { subject: string; html: string }`
  - `novaDuvidaEmail(input)`, `respostaDuvidaEmail(input)`, `novaSolicitacaoEmail(input)`, `decisaoSolicitacaoEmail(input)`
  - `sendEmail(input: { to: string | string[]; subject: string; html: string }): Promise<void>` — nunca lança.

- [ ] **Step 1: Instalar o Resend**

```bash
npm install resend
```

- [ ] **Step 2: Escrever os testes que falham dos templates**

Crie `src/lib/email/templates.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { escapeHtml } from './escape'
import {
  decisaoSolicitacaoEmail,
  novaDuvidaEmail,
  novaSolicitacaoEmail,
  respostaDuvidaEmail,
} from './templates'

describe('escapeHtml', () => {
  it('neutraliza as tags', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    )
  })

  it('neutraliza aspas e e comercial', () => {
    expect(escapeHtml(`Ana & "Bruno" 'Costa'`)).toBe(
      'Ana &amp; &quot;Bruno&quot; &#39;Costa&#39;',
    )
  })

  it('deixa texto comum intacto', () => {
    expect(escapeHtml('Como faço para escalar a campanha?')).toBe(
      'Como faço para escalar a campanha?',
    )
  })
})

describe('novaDuvidaEmail', () => {
  const base = {
    alunoNome: 'Ana Silva',
    aulaTitulo: 'Estrutura de campanha',
    cursoTitulo: 'Meta Ads',
    pergunta: 'Qual orçamento inicial vocês usam?',
    url: 'https://academy.gexcorp.com.br/curso/meta-ads/aula/estrutura',
  }

  it('põe o nome do aluno e a aula no assunto', () => {
    const email = novaDuvidaEmail(base)
    expect(email.subject).toBe('Nova dúvida de Ana Silva em "Estrutura de campanha"')
  })

  it('inclui a pergunta e o link no corpo', () => {
    const email = novaDuvidaEmail(base)
    expect(email.html).toContain('Qual orçamento inicial vocês usam?')
    expect(email.html).toContain(base.url)
  })

  it('escapa HTML vindo do nome e da pergunta', () => {
    const email = novaDuvidaEmail({
      ...base,
      alunoNome: '<img src=x onerror=alert(1)>',
      pergunta: '<script>roubar()</script>',
    })
    expect(email.html).not.toContain('<script>')
    expect(email.html).not.toContain('onerror=')
    expect(email.html).toContain('&lt;script&gt;')
  })
})

describe('respostaDuvidaEmail', () => {
  const base = {
    professorNome: 'Carlos Líder',
    aulaTitulo: 'Estrutura de campanha',
    resposta: 'Começamos com R$ 50 por conjunto.',
    url: 'https://academy.gexcorp.com.br/curso/meta-ads/aula/estrutura',
  }

  it('anuncia quem respondeu no assunto', () => {
    expect(respostaDuvidaEmail(base).subject).toBe(
      'Carlos Líder respondeu sua dúvida em "Estrutura de campanha"',
    )
  })

  it('escapa a resposta', () => {
    const email = respostaDuvidaEmail({ ...base, resposta: '<b>negrito</b>' })
    expect(email.html).not.toContain('<b>negrito</b>')
    expect(email.html).toContain('&lt;b&gt;')
  })
})

describe('novaSolicitacaoEmail', () => {
  it('nomeia a pessoa e o curso', () => {
    const email = novaSolicitacaoEmail({
      solicitanteNome: 'Ana Silva',
      cursoTitulo: 'Meta Ads',
      mensagem: 'Vou assumir campanhas no mês que vem.',
      url: 'https://academy.gexcorp.com.br/admin/solicitacoes',
    })
    expect(email.subject).toBe('Ana Silva pediu acesso a "Meta Ads"')
    expect(email.html).toContain('Vou assumir campanhas no mês que vem.')
  })

  it('funciona sem mensagem', () => {
    const email = novaSolicitacaoEmail({
      solicitanteNome: 'Ana Silva',
      cursoTitulo: 'Meta Ads',
      mensagem: null,
      url: 'https://academy.gexcorp.com.br/admin/solicitacoes',
    })
    expect(email.html).toContain('Ana Silva')
    expect(email.html).not.toContain('null')
  })
})

describe('decisaoSolicitacaoEmail', () => {
  it('avisa a aprovação com link do curso', () => {
    const email = decisaoSolicitacaoEmail({
      cursoTitulo: 'Meta Ads',
      aprovado: true,
      url: 'https://academy.gexcorp.com.br/curso/meta-ads',
    })
    expect(email.subject).toBe('Seu acesso a "Meta Ads" foi liberado')
    expect(email.html).toContain('https://academy.gexcorp.com.br/curso/meta-ads')
  })

  it('avisa a recusa sem prometer link', () => {
    const email = decisaoSolicitacaoEmail({
      cursoTitulo: 'Meta Ads',
      aprovado: false,
      url: 'https://academy.gexcorp.com.br/curso/meta-ads',
    })
    expect(email.subject).toBe('Sobre seu pedido de acesso a "Meta Ads"')
    expect(email.html).toContain('não foi liberado')
  })
})
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npm test -- src/lib/email`
Expected: FAIL — módulos não encontrados.

- [ ] **Step 4: Implementar escape e templates**

Crie `src/lib/email/escape.ts`:

```typescript
const MAPA: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/**
 * Escapa texto de usuário antes de entrar no HTML do e-mail.
 * Sem isso, um nome ou uma pergunta com marcação quebraria o layout do e-mail —
 * e, em clientes de e-mail permissivos, executaria conteúdo de terceiros.
 */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => MAPA[ch])
}
```

Crie `src/lib/email/templates.ts`:

```typescript
import { escapeHtml } from './escape'

export type EmailContent = { subject: string; html: string }

function layout(titulo: string, corpo: string, url: string, rotuloBotao: string): string {
  return `
<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#14181f">
  <p style="font-size:14px;font-weight:600;color:#1d4fd8;margin:0 0 16px">GEX Academy</p>
  <h1 style="font-size:18px;margin:0 0 12px">${titulo}</h1>
  ${corpo}
  <p style="margin:24px 0 0">
    <a href="${url}" style="display:inline-block;background:#1d4fd8;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px">${rotuloBotao}</a>
  </p>
</div>`.trim()
}

function citacao(texto: string): string {
  return `<blockquote style="margin:0 0 12px;padding:12px 16px;background:#f6f7f9;border-left:3px solid #e3e6ea;font-size:14px;white-space:pre-line">${escapeHtml(texto)}</blockquote>`
}

export function novaDuvidaEmail(input: {
  alunoNome: string
  aulaTitulo: string
  cursoTitulo: string
  pergunta: string
  url: string
}): EmailContent {
  return {
    subject: `Nova dúvida de ${input.alunoNome} em "${input.aulaTitulo}"`,
    html: layout(
      `Nova dúvida em ${escapeHtml(input.aulaTitulo)}`,
      `<p style="font-size:14px;margin:0 0 12px">${escapeHtml(input.alunoNome)} perguntou no curso ${escapeHtml(input.cursoTitulo)}:</p>
       ${citacao(input.pergunta)}`,
      input.url,
      'Responder',
    ),
  }
}

export function respostaDuvidaEmail(input: {
  professorNome: string
  aulaTitulo: string
  resposta: string
  url: string
}): EmailContent {
  return {
    subject: `${input.professorNome} respondeu sua dúvida em "${input.aulaTitulo}"`,
    html: layout(
      'Sua dúvida foi respondida',
      `<p style="font-size:14px;margin:0 0 12px">${escapeHtml(input.professorNome)} respondeu na aula ${escapeHtml(input.aulaTitulo)}:</p>
       ${citacao(input.resposta)}`,
      input.url,
      'Ver a resposta',
    ),
  }
}

export function novaSolicitacaoEmail(input: {
  solicitanteNome: string
  cursoTitulo: string
  mensagem: string | null
  url: string
}): EmailContent {
  return {
    subject: `${input.solicitanteNome} pediu acesso a "${input.cursoTitulo}"`,
    html: layout(
      'Nova solicitação de acesso',
      `<p style="font-size:14px;margin:0 0 12px">${escapeHtml(input.solicitanteNome)} pediu acesso ao curso ${escapeHtml(input.cursoTitulo)}.</p>
       ${input.mensagem ? citacao(input.mensagem) : ''}`,
      input.url,
      'Decidir',
    ),
  }
}

export function decisaoSolicitacaoEmail(input: {
  cursoTitulo: string
  aprovado: boolean
  url: string
}): EmailContent {
  if (input.aprovado) {
    return {
      subject: `Seu acesso a "${input.cursoTitulo}" foi liberado`,
      html: layout(
        'Acesso liberado',
        `<p style="font-size:14px;margin:0 0 12px">Você já pode assistir ao curso ${escapeHtml(input.cursoTitulo)}.</p>`,
        input.url,
        'Começar agora',
      ),
    }
  }

  return {
    subject: `Sobre seu pedido de acesso a "${input.cursoTitulo}"`,
    html: layout(
      'Pedido de acesso',
      `<p style="font-size:14px;margin:0 0 12px">Seu acesso ao curso ${escapeHtml(input.cursoTitulo)} não foi liberado neste momento. Fale com seu gestor se ainda precisar dele.</p>`,
      input.url,
      'Ver a plataforma',
    ),
  }
}
```

- [ ] **Step 5: Implementar o envio**

Crie `src/lib/email/send.ts`:

```typescript
import 'server-only'
import { Resend } from 'resend'

/**
 * Envia um e-mail transacional.
 *
 * NUNCA lança: se o Resend estiver fora do ar ou a chave ausente, registra no
 * log e devolve normalmente. Perder um aviso é ruim; perder a pergunta que o
 * aluno acabou de escrever é inaceitável.
 */
export async function sendEmail(input: {
  to: string | string[]
  subject: string
  html: string
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM

  if (!apiKey || !from) {
    console.warn('[email] RESEND_API_KEY ou EMAIL_FROM ausente; e-mail não enviado:', input.subject)
    return
  }

  const destinatarios = Array.isArray(input.to) ? input.to : [input.to]
  if (destinatarios.length === 0) return

  try {
    const resend = new Resend(apiKey)
    const { error } = await resend.emails.send({
      from,
      to: destinatarios,
      subject: input.subject,
      html: input.html,
    })
    if (error) console.error('[email] falha no envio:', error)
  } catch (error) {
    console.error('[email] exceção no envio:', error)
  }
}
```

Crie `src/lib/email/index.ts`:

```typescript
export { escapeHtml } from './escape'
export { sendEmail } from './send'
export {
  decisaoSolicitacaoEmail,
  novaDuvidaEmail,
  novaSolicitacaoEmail,
  respostaDuvidaEmail,
} from './templates'
export type { EmailContent } from './templates'
```

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `npm test -- src/lib/email && npm run typecheck`
Expected: PASS — 12 testes.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(email): templates com escape de HTML e envio pelo Resend que nunca derruba a acao"
```

---

### Task 3: Fórum de dúvidas

**Files:**
- Create: `src/lib/forum/rate-limit.ts`
- Create: `src/server/forum.ts`
- Create: `src/components/forum/forum-section.tsx`
- Create: `src/components/forum/question-item.tsx`
- Modify: `src/app/(app)/curso/[slug]/aula/[lessonSlug]/page.tsx`
- Test: `src/lib/forum/rate-limit.test.ts`

**Interfaces:**
- Consumes: `getCurrentUser`, `getLessonView`, `sendEmail`, `novaDuvidaEmail`, `respostaDuvidaEmail`, `createAdminSupabase`.
- Produces:
  - `LIMITE_PUBLICACOES = 10`, `JANELA_MINUTOS = 5`
  - `excedeuLimite(publicacoesRecentes: Date[], agora: Date): boolean`
  - `type ForumAuthor = { id: string; name: string; isInstructor: boolean }`
  - `type ForumAnswer = { id: string; body: string; createdAt: string; author: ForumAuthor; canEdit: boolean }`
  - `type ForumQuestion = { id: string; body: string; createdAt: string; isPinned: boolean; resolved: boolean; author: ForumAuthor; answers: ForumAnswer[]; canEdit: boolean; canModerate: boolean }`
  - `listQuestions(lessonId: string): Promise<ForumQuestion[]>`
  - `askQuestion`, `answerQuestion`, `toggleResolved`, `togglePinned`, `deleteQuestion`, `deleteAnswer`

- [ ] **Step 1: Escrever o teste que falha do limite de publicações**

Crie `src/lib/forum/rate-limit.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { excedeuLimite, JANELA_MINUTOS, LIMITE_PUBLICACOES } from './rate-limit'

const AGORA = new Date('2026-08-31T12:00:00-03:00')

function minutosAtras(minutos: number): Date {
  return new Date(AGORA.getTime() - minutos * 60_000)
}

describe('excedeuLimite', () => {
  it('libera quem nunca publicou', () => {
    expect(excedeuLimite([], AGORA)).toBe(false)
  })

  it('libera abaixo do limite', () => {
    const recentes = Array.from({ length: LIMITE_PUBLICACOES - 1 }, () => minutosAtras(1))
    expect(excedeuLimite(recentes, AGORA)).toBe(false)
  })

  it('bloqueia ao atingir o limite dentro da janela', () => {
    const recentes = Array.from({ length: LIMITE_PUBLICACOES }, () => minutosAtras(1))
    expect(excedeuLimite(recentes, AGORA)).toBe(true)
  })

  it('ignora publicações fora da janela', () => {
    const antigas = Array.from({ length: LIMITE_PUBLICACOES }, () => minutosAtras(JANELA_MINUTOS + 1))
    expect(excedeuLimite(antigas, AGORA)).toBe(false)
  })

  it('conta apenas as que estão dentro da janela', () => {
    const mistura = [
      ...Array.from({ length: LIMITE_PUBLICACOES - 1 }, () => minutosAtras(1)),
      ...Array.from({ length: 5 }, () => minutosAtras(JANELA_MINUTOS + 2)),
    ]
    expect(excedeuLimite(mistura, AGORA)).toBe(false)
  })

  it('trata a borda exata da janela como fora', () => {
    const naBorda = Array.from({ length: LIMITE_PUBLICACOES }, () => minutosAtras(JANELA_MINUTOS))
    expect(excedeuLimite(naBorda, AGORA)).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- src/lib/forum`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar o limite**

Crie `src/lib/forum/rate-limit.ts`:

```typescript
export const LIMITE_PUBLICACOES = 10
export const JANELA_MINUTOS = 5

/**
 * Diz se a pessoa já publicou demais na janela recente.
 * Função pura recebendo "agora" por parâmetro para poder ser testada sem
 * mexer no relógio do processo.
 */
export function excedeuLimite(publicacoesRecentes: Date[], agora: Date): boolean {
  const inicioDaJanela = agora.getTime() - JANELA_MINUTOS * 60_000
  const dentroDaJanela = publicacoesRecentes.filter((data) => data.getTime() > inicioDaJanela)
  return dentroDaJanela.length >= LIMITE_PUBLICACOES
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- src/lib/forum`
Expected: PASS — 6 testes.

- [ ] **Step 5: Implementar as server actions do fórum**

Crie `src/server/forum.ts`:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth/session'
import { novaDuvidaEmail, respostaDuvidaEmail, sendEmail } from '@/lib/email'
import { excedeuLimite } from '@/lib/forum/rate-limit'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createServerSupabase } from '@/lib/supabase/server'
import { ok, toActionError, type ActionResult } from './result'
import { getLessonView } from './viewer'

export type ForumAuthor = { id: string; name: string; isInstructor: boolean }
export type ForumAnswer = {
  id: string
  body: string
  createdAt: string
  author: ForumAuthor
  canEdit: boolean
}
export type ForumQuestion = {
  id: string
  body: string
  createdAt: string
  isPinned: boolean
  resolved: boolean
  author: ForumAuthor
  answers: ForumAnswer[]
  canEdit: boolean
  canModerate: boolean
}

const corpoSchema = z
  .string()
  .trim()
  .min(1, 'Escreva sua mensagem.')
  .max(4000, 'A mensagem passa de 4000 caracteres.')

/** Confirma acesso à aula e devolve o contexto necessário para as actions. */
async function contextoDaAula(lessonId: string) {
  const user = await getCurrentUser()
  if (!user || user.status !== 'active') return null

  const admin = createAdminSupabase()
  const { data } = await admin
    .from('lessons')
    .select('id, title, slug, course_id, courses(slug, title, area_id, owner_id)')
    .eq('id', lessonId)
    .maybeSingle()
  if (!data) return null

  const curso = data.courses as unknown as {
    slug: string
    title: string
    area_id: string | null
    owner_id: string
  }

  const view = await getLessonView(curso.slug, data.slug)
  if (!view) return null

  const podeModerar =
    user.role === 'admin' || (user.role === 'leader' && !!user.areaId && user.areaId === curso.area_id)

  return {
    user,
    lessonId: data.id,
    lessonTitle: data.title,
    courseSlug: curso.slug,
    courseTitle: curso.title,
    lessonSlug: data.slug,
    ownerId: curso.owner_id,
    areaId: curso.area_id,
    podeModerar,
  }
}

/** Publicações da pessoa nos últimos minutos, para o limite de abuso. */
async function publicacoesRecentes(userId: string): Promise<Date[]> {
  const admin = createAdminSupabase()
  const desde = new Date(Date.now() - 60 * 60_000).toISOString()

  const [perguntas, respostas] = await Promise.all([
    admin.from('questions').select('created_at').eq('author_id', userId).gte('created_at', desde),
    admin.from('answers').select('created_at').eq('author_id', userId).gte('created_at', desde),
  ])

  return [...(perguntas.data ?? []), ...(respostas.data ?? [])].map((r) => new Date(r.created_at))
}

export async function listQuestions(lessonId: string): Promise<ForumQuestion[]> {
  const ctx = await contextoDaAula(lessonId)
  if (!ctx) return []

  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('questions')
    .select(
      'id, body, is_pinned, resolved_at, created_at, author_id, profiles(full_name, role, area_id), answers(id, body, created_at, author_id, profiles(full_name, role, area_id))',
    )
    .eq('lesson_id', lessonId)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })

  type Perfil = { full_name: string; role: string; area_id: string | null }
  type LinhaResposta = {
    id: string
    body: string
    created_at: string
    author_id: string
    profiles: Perfil | null
  }
  type LinhaPergunta = {
    id: string
    body: string
    is_pinned: boolean
    resolved_at: string | null
    created_at: string
    author_id: string
    profiles: Perfil | null
    answers: LinhaResposta[]
  }

  // Selo de professor: admin, ou líder da área deste curso.
  function autor(id: string, perfil: Perfil | null): ForumAuthor {
    return {
      id,
      name: perfil?.full_name ?? 'Colaborador',
      isInstructor:
        perfil?.role === 'admin' ||
        (perfil?.role === 'leader' && !!perfil.area_id && perfil.area_id === ctx!.areaId),
    }
  }

  return ((data ?? []) as unknown as LinhaPergunta[]).map((q) => ({
    id: q.id,
    body: q.body,
    createdAt: q.created_at,
    isPinned: q.is_pinned,
    resolved: q.resolved_at !== null,
    author: autor(q.author_id, q.profiles),
    canEdit: q.author_id === ctx.user.id,
    canModerate: ctx.podeModerar,
    answers: [...q.answers]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((a) => ({
        id: a.id,
        body: a.body,
        createdAt: a.created_at,
        author: autor(a.author_id, a.profiles),
        canEdit: a.author_id === ctx.user.id || ctx.podeModerar,
      })),
  }))
}

export async function askQuestion(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = z
      .object({ lessonId: z.string().uuid(), body: corpoSchema })
      .safeParse(Object.fromEntries(formData))
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

    const ctx = await contextoDaAula(parsed.data.lessonId)
    if (!ctx) return { ok: false, error: 'Você não tem acesso a esta aula.' }

    if (excedeuLimite(await publicacoesRecentes(ctx.user.id), new Date())) {
      return { ok: false, error: 'Você publicou muitas mensagens seguidas. Tente de novo em alguns minutos.' }
    }

    const supabase = await createServerSupabase()
    const { data, error } = await supabase
      .from('questions')
      .insert({ lesson_id: ctx.lessonId, author_id: ctx.user.id, body: parsed.data.body })
      .select('id')
      .single()
    if (error) throw error

    // Avisa o dono do curso. Falha de e-mail não desfaz a pergunta.
    const admin = createAdminSupabase()
    const { data: dono } = await admin
      .from('profiles')
      .select('email')
      .eq('id', ctx.ownerId)
      .maybeSingle()

    if (dono?.email && ctx.ownerId !== ctx.user.id) {
      const conteudo = novaDuvidaEmail({
        alunoNome: ctx.user.fullName,
        aulaTitulo: ctx.lessonTitle,
        cursoTitulo: ctx.courseTitle,
        pergunta: parsed.data.body,
        url: `${process.env.NEXT_PUBLIC_SITE_URL}/curso/${ctx.courseSlug}/aula/${ctx.lessonSlug}`,
      })
      await sendEmail({ to: dono.email, ...conteudo })
    }

    revalidatePath(`/curso/${ctx.courseSlug}/aula/${ctx.lessonSlug}`)
    revalidatePath('/gerenciar/duvidas')
    return ok({ id: data.id })
  } catch (error) {
    return toActionError(error)
  }
}

export async function answerQuestion(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = z
      .object({ questionId: z.string().uuid(), body: corpoSchema })
      .safeParse(Object.fromEntries(formData))
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

    const admin = createAdminSupabase()
    const { data: pergunta } = await admin
      .from('questions')
      .select('id, lesson_id, author_id, profiles(email, full_name)')
      .eq('id', parsed.data.questionId)
      .maybeSingle()
    if (!pergunta) return { ok: false, error: 'Pergunta não encontrada.' }

    const ctx = await contextoDaAula(pergunta.lesson_id)
    if (!ctx) return { ok: false, error: 'Você não tem acesso a esta aula.' }

    if (excedeuLimite(await publicacoesRecentes(ctx.user.id), new Date())) {
      return { ok: false, error: 'Você publicou muitas mensagens seguidas. Tente de novo em alguns minutos.' }
    }

    const supabase = await createServerSupabase()
    const { data, error } = await supabase
      .from('answers')
      .insert({ question_id: parsed.data.questionId, author_id: ctx.user.id, body: parsed.data.body })
      .select('id')
      .single()
    if (error) throw error

    const autorPergunta = pergunta.profiles as unknown as { email: string; full_name: string } | null
    if (autorPergunta?.email && pergunta.author_id !== ctx.user.id) {
      const conteudo = respostaDuvidaEmail({
        professorNome: ctx.user.fullName,
        aulaTitulo: ctx.lessonTitle,
        resposta: parsed.data.body,
        url: `${process.env.NEXT_PUBLIC_SITE_URL}/curso/${ctx.courseSlug}/aula/${ctx.lessonSlug}`,
      })
      await sendEmail({ to: autorPergunta.email, ...conteudo })
    }

    revalidatePath(`/curso/${ctx.courseSlug}/aula/${ctx.lessonSlug}`)
    revalidatePath('/gerenciar/duvidas')
    return ok({ id: data.id })
  } catch (error) {
    return toActionError(error)
  }
}

/** Ações de moderação e exclusão, todas checando quem pode o quê. */
async function moderar(
  formData: FormData,
  operacao: (ctx: NonNullable<Awaited<ReturnType<typeof contextoDaAula>>>, questionId: string) => Promise<void>,
  exigeModeracao: boolean,
): Promise<ActionResult<null>> {
  const id = z.string().uuid().safeParse(formData.get('questionId'))
  if (!id.success) return { ok: false, error: 'Pergunta inválida.' }

  const admin = createAdminSupabase()
  const { data: pergunta } = await admin
    .from('questions')
    .select('id, lesson_id, author_id')
    .eq('id', id.data)
    .maybeSingle()
  if (!pergunta) return { ok: false, error: 'Pergunta não encontrada.' }

  const ctx = await contextoDaAula(pergunta.lesson_id)
  if (!ctx) return { ok: false, error: 'Você não tem acesso a esta aula.' }

  const autorizado = exigeModeracao
    ? ctx.podeModerar
    : ctx.podeModerar || pergunta.author_id === ctx.user.id
  if (!autorizado) return { ok: false, error: 'Você não tem permissão para esta ação.' }

  await operacao(ctx, id.data)
  revalidatePath(`/curso/${ctx.courseSlug}/aula/${ctx.lessonSlug}`)
  revalidatePath('/gerenciar/duvidas')
  return ok(null)
}

export async function togglePinned(_prev: unknown, formData: FormData): Promise<ActionResult<null>> {
  try {
    return await moderar(
      formData,
      async (_ctx, questionId) => {
        const admin = createAdminSupabase()
        const { data } = await admin.from('questions').select('is_pinned').eq('id', questionId).single()
        await admin.from('questions').update({ is_pinned: !data!.is_pinned }).eq('id', questionId)
      },
      true,
    )
  } catch (error) {
    return toActionError(error)
  }
}

export async function toggleResolved(_prev: unknown, formData: FormData): Promise<ActionResult<null>> {
  try {
    return await moderar(
      formData,
      async (_ctx, questionId) => {
        const admin = createAdminSupabase()
        const { data } = await admin.from('questions').select('resolved_at').eq('id', questionId).single()
        await admin
          .from('questions')
          .update({ resolved_at: data!.resolved_at ? null : new Date().toISOString() })
          .eq('id', questionId)
      },
      true,
    )
  } catch (error) {
    return toActionError(error)
  }
}

export async function deleteQuestion(_prev: unknown, formData: FormData): Promise<ActionResult<null>> {
  try {
    return await moderar(
      formData,
      async (_ctx, questionId) => {
        const admin = createAdminSupabase()
        await admin.from('questions').delete().eq('id', questionId)
      },
      false,
    )
  } catch (error) {
    return toActionError(error)
  }
}

export async function deleteAnswer(_prev: unknown, formData: FormData): Promise<ActionResult<null>> {
  try {
    const id = z.string().uuid().safeParse(formData.get('answerId'))
    if (!id.success) return { ok: false, error: 'Resposta inválida.' }

    const admin = createAdminSupabase()
    const { data: resposta } = await admin
      .from('answers')
      .select('id, author_id, questions(lesson_id)')
      .eq('id', id.data)
      .maybeSingle()
    if (!resposta) return { ok: false, error: 'Resposta não encontrada.' }

    const lessonId = (resposta.questions as unknown as { lesson_id: string }).lesson_id
    const ctx = await contextoDaAula(lessonId)
    if (!ctx) return { ok: false, error: 'Você não tem acesso a esta aula.' }

    if (!ctx.podeModerar && resposta.author_id !== ctx.user.id) {
      return { ok: false, error: 'Você não tem permissão para esta ação.' }
    }

    await admin.from('answers').delete().eq('id', id.data)
    revalidatePath(`/curso/${ctx.courseSlug}/aula/${ctx.lessonSlug}`)
    return ok(null)
  } catch (error) {
    return toActionError(error)
  }
}
```

- [ ] **Step 6: Criar os componentes do fórum**

Crie `src/components/forum/question-item.tsx`:

```typescript
'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import {
  answerQuestion,
  deleteAnswer,
  deleteQuestion,
  togglePinned,
  toggleResolved,
  type ForumQuestion,
} from '@/server/forum'

const formatador = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
})

function Selo({ children }: { children: string }) {
  return (
    <span className="rounded-full bg-marca-50 px-2 py-0.5 text-[10px] font-medium text-marca-700">
      {children}
    </span>
  )
}

export function QuestionItem({ question }: { question: ForumQuestion }) {
  const [answerState, answerAction, answering] = useActionState(answerQuestion, null)
  const [, pinAction] = useActionState(togglePinned, null)
  const [, resolveAction] = useActionState(toggleResolved, null)
  const [, deleteQuestionAction] = useActionState(deleteQuestion, null)
  const [, deleteAnswerAction] = useActionState(deleteAnswer, null)

  return (
    <li className="rounded-card border border-borda bg-superficie p-4">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <p className="flex flex-wrap items-center gap-2 text-xs text-texto-suave">
            <span className="font-medium text-texto">{question.author.name}</span>
            {question.author.isInstructor && <Selo>Professor</Selo>}
            {question.isPinned && <Selo>Fixada</Selo>}
            {question.resolved && <Selo>Resolvida</Selo>}
            <span>{formatador.format(new Date(question.createdAt))}</span>
          </p>
          {/* Texto puro: whitespace-pre-line preserva quebras sem interpretar marcação. */}
          <p className="mt-2 whitespace-pre-line text-sm">{question.body}</p>
        </div>

        <div className="flex shrink-0 gap-1">
          {question.canModerate && (
            <>
              <form action={pinAction}>
                <input type="hidden" name="questionId" value={question.id} />
                <Button type="submit" variant="secundario" className="px-2 py-0.5 text-xs">
                  {question.isPinned ? 'Desafixar' : 'Fixar'}
                </Button>
              </form>
              <form action={resolveAction}>
                <input type="hidden" name="questionId" value={question.id} />
                <Button type="submit" variant="secundario" className="px-2 py-0.5 text-xs">
                  {question.resolved ? 'Reabrir' : 'Resolver'}
                </Button>
              </form>
            </>
          )}
          {(question.canEdit || question.canModerate) && (
            <form
              action={deleteQuestionAction}
              onSubmit={(e) => {
                if (!confirm('Excluir esta pergunta e as respostas dela?')) e.preventDefault()
              }}
            >
              <input type="hidden" name="questionId" value={question.id} />
              <Button type="submit" variant="perigo" className="px-2 py-0.5 text-xs">
                Excluir
              </Button>
            </form>
          )}
        </div>
      </div>

      {question.answers.length > 0 && (
        <ul className="mt-4 flex flex-col gap-3 border-l-2 border-borda pl-4">
          {question.answers.map((answer) => (
            <li key={answer.id} className="flex items-start gap-2">
              <div className="flex-1">
                <p className="flex flex-wrap items-center gap-2 text-xs text-texto-suave">
                  <span className="font-medium text-texto">{answer.author.name}</span>
                  {answer.author.isInstructor && <Selo>Professor</Selo>}
                  <span>{formatador.format(new Date(answer.createdAt))}</span>
                </p>
                <p className="mt-1 whitespace-pre-line text-sm">{answer.body}</p>
              </div>
              {answer.canEdit && (
                <form action={deleteAnswerAction}>
                  <input type="hidden" name="answerId" value={answer.id} />
                  <Button type="submit" variant="secundario" className="px-2 py-0.5 text-xs">
                    Excluir
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      <form action={answerAction} className="mt-4 flex flex-col gap-2">
        <input type="hidden" name="questionId" value={question.id} />
        <label htmlFor={`resposta-${question.id}`} className="sr-only">
          Responder
        </label>
        <textarea
          id={`resposta-${question.id}`}
          name="body"
          rows={2}
          required
          maxLength={4000}
          placeholder="Escreva uma resposta…"
          className="w-full rounded-lg border border-borda bg-superficie px-3 py-2 text-sm"
        />
        {answerState && !answerState.ok && (
          <p role="alert" className="text-xs text-perigo">
            {answerState.error}
          </p>
        )}
        <Button type="submit" variant="secundario" disabled={answering} className="self-start">
          {answering ? 'Enviando…' : 'Responder'}
        </Button>
      </form>
    </li>
  )
}
```

Crie `src/components/forum/forum-section.tsx`:

```typescript
'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { askQuestion, type ForumQuestion } from '@/server/forum'
import { QuestionItem } from './question-item'

export function ForumSection({
  lessonId,
  questions,
}: {
  lessonId: string
  questions: ForumQuestion[]
}) {
  const [state, action, pending] = useActionState(askQuestion, null)

  return (
    <section className="mt-10">
      <h2 className="mb-3 text-sm font-semibold">Dúvidas</h2>

      <form action={action} className="mb-6 flex flex-col gap-2">
        <input type="hidden" name="lessonId" value={lessonId} />
        <label htmlFor="nova-duvida" className="sr-only">
          Sua dúvida
        </label>
        <textarea
          id="nova-duvida"
          name="body"
          rows={3}
          required
          maxLength={4000}
          placeholder="Ficou com alguma dúvida nesta aula?"
          className="w-full rounded-lg border border-borda bg-superficie px-3 py-2 text-sm"
        />
        {state && !state.ok && (
          <p role="alert" className="text-xs text-perigo">
            {state.error}
          </p>
        )}
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? 'Enviando…' : 'Enviar dúvida'}
        </Button>
      </form>

      {questions.length === 0 ? (
        <p className="text-xs text-texto-suave">
          Nenhuma dúvida ainda. Seja o primeiro a perguntar.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {questions.map((question) => (
            <QuestionItem key={question.id} question={question} />
          ))}
        </ul>
      )}
    </section>
  )
}
```

- [ ] **Step 7: Ligar o fórum à página da aula**

Em `src/app/(app)/curso/[slug]/aula/[lessonSlug]/page.tsx`, carregue as perguntas e renderize a seção depois da navegação:

```typescript
import { ForumSection } from '@/components/forum/forum-section'
import { listQuestions } from '@/server/forum'

// junto dos outros carregamentos:
const questions = await listQuestions(lesson.id)

// como último filho do container, depois do <nav>:
<ForumSection lessonId={lesson.id} questions={questions} />
```

- [ ] **Step 8: Rodar tudo**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(forum): duvidas e respostas por aula, com selo de professor e limite de abuso"
```

---

### Task 4: Fila de dúvidas do líder

**Files:**
- Modify: `src/server/forum.ts`
- Create: `src/app/(manage)/gerenciar/duvidas/page.tsx`

**Interfaces:**
- Consumes: `getCurrentUser`, `createServerSupabase`.
- Produces:
  - `type PendingQuestion = { id: string; body: string; createdAt: string; authorName: string; lessonTitle: string; courseTitle: string; courseSlug: string; lessonSlug: string; answerCount: number }`
  - `listPendingQuestions(): Promise<PendingQuestion[]>`

- [ ] **Step 1: Implementar a consulta da fila**

Acrescente ao final de `src/server/forum.ts`:

```typescript
export type PendingQuestion = {
  id: string
  body: string
  createdAt: string
  authorName: string
  lessonTitle: string
  courseTitle: string
  courseSlug: string
  lessonSlug: string
  answerCount: number
}

/**
 * Perguntas ainda não resolvidas nos cursos que a pessoa gerencia.
 * Sem esta tela o líder não descobre que alguém perguntou, e o fórum morre.
 */
export async function listPendingQuestions(): Promise<PendingQuestion[]> {
  const user = await getCurrentUser()
  if (!user || user.status !== 'active' || user.role === 'member') return []

  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('questions')
    .select(
      'id, body, created_at, resolved_at, profiles(full_name), answers(id), lessons!inner(title, slug, courses!inner(title, slug, area_id))',
    )
    .is('resolved_at', null)
    .order('created_at', { ascending: true })

  type Linha = {
    id: string
    body: string
    created_at: string
    profiles: { full_name: string } | null
    answers: { id: string }[]
    lessons: {
      title: string
      slug: string
      courses: { title: string; slug: string; area_id: string | null }
    }
  }

  return ((data ?? []) as unknown as Linha[])
    // O RLS já limita o que chega, mas o líder também não deve ver a fila de outra área.
    .filter((q) => user.role === 'admin' || q.lessons.courses.area_id === user.areaId)
    .map((q) => ({
      id: q.id,
      body: q.body,
      createdAt: q.created_at,
      authorName: q.profiles?.full_name ?? 'Colaborador',
      lessonTitle: q.lessons.title,
      courseTitle: q.lessons.courses.title,
      courseSlug: q.lessons.courses.slug,
      lessonSlug: q.lessons.slug,
      answerCount: q.answers.length,
    }))
}
```

- [ ] **Step 2: Criar a tela da fila**

Crie `src/app/(manage)/gerenciar/duvidas/page.tsx`:

```typescript
import Link from 'next/link'
import { listPendingQuestions } from '@/server/forum'

export const metadata = { title: 'Dúvidas — GEX Academy' }

const formatador = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
})

export default async function DuvidasPage() {
  const questions = await listPendingQuestions()

  const semResposta = questions.filter((q) => q.answerCount === 0)
  const comResposta = questions.filter((q) => q.answerCount > 0)

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-semibold">Dúvidas em aberto</h1>
      <p className="mb-6 mt-1 text-sm text-texto-suave">
        {semResposta.length} sem resposta · {comResposta.length} respondidas mas ainda não resolvidas
      </p>

      {questions.length === 0 ? (
        <p className="text-sm text-texto-suave">Nenhuma dúvida em aberto. Tudo em dia.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {[...semResposta, ...comResposta].map((question) => (
            <li key={question.id} className="rounded-card border border-borda bg-superficie p-4">
              <p className="text-xs text-texto-suave">
                <span className="font-medium text-texto">{question.authorName}</span> ·{' '}
                {question.courseTitle} / {question.lessonTitle} ·{' '}
                {formatador.format(new Date(question.createdAt))}
                {question.answerCount === 0 && (
                  <span className="ml-2 rounded-full bg-aviso/10 px-2 py-0.5 text-[10px] text-aviso">
                    sem resposta
                  </span>
                )}
              </p>
              <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm">{question.body}</p>
              <Link
                href={`/curso/${question.courseSlug}/aula/${question.lessonSlug}`}
                className="mt-2 inline-block text-xs text-marca-600 hover:underline"
              >
                Abrir a aula e responder →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Rodar tudo**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(duvidas): fila de perguntas em aberto para o lider da area"
```

---

### Task 5: Solicitação de acesso e a fila do admin

**Files:**
- Create: `src/server/access-requests.ts`
- Create: `src/components/catalog/request-access-form.tsx`
- Create: `src/app/(admin)/admin/solicitacoes/page.tsx`
- Create: `src/app/(admin)/admin/solicitacoes/request-row.tsx`
- Modify: `src/components/catalog/locked-course.tsx`
- Modify: `src/app/(app)/curso/[slug]/page.tsx`

**Interfaces:**
- Consumes: `getCurrentUser`, `assertRole`, `getCourseView`, `sendEmail`, `novaSolicitacaoEmail`, `decisaoSolicitacaoEmail`, `createAdminSupabase`.
- Produces:
  - `requestAccess(_prev, formData): Promise<ActionResult<null>>`
  - `type PendingRequest = { id: string; createdAt: string; message: string | null; personName: string; personEmail: string; areaName: string | null; courseId: string; courseTitle: string }`
  - `listAccessRequests(): Promise<PendingRequest[]>`
  - `decideAccessRequest(_prev, formData): Promise<ActionResult<null>>`
  - `LockedCourse` passa a receber `requestStatus: 'none' | 'pending'`.

- [ ] **Step 1: Implementar as server actions**

Crie `src/server/access-requests.ts`:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { assertRole } from '@/lib/auth/guards'
import { getCurrentUser } from '@/lib/auth/session'
import { decisaoSolicitacaoEmail, novaSolicitacaoEmail, sendEmail } from '@/lib/email'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createServerSupabase } from '@/lib/supabase/server'
import { ok, toActionError, type ActionResult } from './result'
import { getCourseView } from './viewer'

export type PendingRequest = {
  id: string
  createdAt: string
  message: string | null
  personName: string
  personEmail: string
  areaName: string | null
  courseId: string
  courseTitle: string
}

export async function requestAccess(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const user = await getCurrentUser()
    if (!user || user.status !== 'active') return { ok: false, error: 'Faça login para continuar.' }

    const parsed = z
      .object({
        courseSlug: z.string().min(1),
        message: z.string().trim().max(500).optional().or(z.literal('')),
      })
      .safeParse(Object.fromEntries(formData))
    if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }

    const course = await getCourseView(parsed.data.courseSlug)
    if (!course) return { ok: false, error: 'Curso não encontrado.' }
    if (course.access !== 'none') return { ok: false, error: 'Você já tem acesso a este curso.' }

    const supabase = await createServerSupabase()
    const { error } = await supabase.from('access_requests').insert({
      user_id: user.id,
      course_id: course.id,
      message: parsed.data.message || null,
      status: 'pending',
    })

    if (error) {
      // O índice único garante uma pendência por pessoa e curso.
      if (error.code === '23505') {
        return { ok: false, error: 'Você já pediu acesso a este curso. Aguarde a resposta.' }
      }
      throw error
    }

    // Avisa todos os admins ativos.
    const admin = createAdminSupabase()
    const { data: admins } = await admin
      .from('profiles')
      .select('email')
      .eq('role', 'admin')
      .eq('status', 'active')

    const destinatarios = (admins ?? []).map((a) => a.email)
    if (destinatarios.length > 0) {
      const conteudo = novaSolicitacaoEmail({
        solicitanteNome: user.fullName,
        cursoTitulo: course.title,
        mensagem: parsed.data.message || null,
        url: `${process.env.NEXT_PUBLIC_SITE_URL}/admin/solicitacoes`,
      })
      await sendEmail({ to: destinatarios, ...conteudo })
    }

    revalidatePath(`/curso/${parsed.data.courseSlug}`)
    revalidatePath('/')
    revalidatePath('/admin/solicitacoes')
    return ok(null)
  } catch (error) {
    return toActionError(error)
  }
}

export async function listAccessRequests(): Promise<PendingRequest[]> {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin' || user.status !== 'active') return []

  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('access_requests')
    .select('id, created_at, message, course_id, profiles(full_name, email, areas(name)), courses(title)')
    .eq('status', 'pending')
    .order('created_at')

  type Linha = {
    id: string
    created_at: string
    message: string | null
    course_id: string
    profiles: { full_name: string; email: string; areas: { name: string } | null } | null
    courses: { title: string } | null
  }

  return ((data ?? []) as unknown as Linha[]).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    message: row.message,
    personName: row.profiles?.full_name ?? 'Colaborador',
    personEmail: row.profiles?.email ?? '',
    areaName: row.profiles?.areas?.name ?? null,
    courseId: row.course_id,
    courseTitle: row.courses?.title ?? 'Curso',
  }))
}

export async function decideAccessRequest(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const decisor = assertRole(await getCurrentUser(), ['admin'])

    const parsed = z
      .object({ id: z.string().uuid(), decisao: z.enum(['approved', 'denied']) })
      .safeParse(Object.fromEntries(formData))
    if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }

    const admin = createAdminSupabase()
    const { data: solicitacao } = await admin
      .from('access_requests')
      .select('id, user_id, course_id, status, profiles(email), courses(title, slug)')
      .eq('id', parsed.data.id)
      .maybeSingle()

    if (!solicitacao) return { ok: false, error: 'Solicitação não encontrada.' }
    if (solicitacao.status !== 'pending') return { ok: false, error: 'Esta solicitação já foi decidida.' }

    const { error } = await admin
      .from('access_requests')
      .update({
        status: parsed.data.decisao,
        decided_by: decisor.id,
        decided_at: new Date().toISOString(),
      })
      .eq('id', parsed.data.id)
    if (error) throw error

    if (parsed.data.decisao === 'approved') {
      const { error: acessoError } = await admin.from('course_access').insert({
        user_id: solicitacao.user_id,
        course_id: solicitacao.course_id,
        granted_by: decisor.id,
      })
      // Já existir a liberação não é erro: o resultado desejado está garantido.
      if (acessoError && acessoError.code !== '23505') throw acessoError
    }

    const solicitante = solicitacao.profiles as unknown as { email: string } | null
    const curso = solicitacao.courses as unknown as { title: string; slug: string } | null
    if (solicitante?.email && curso) {
      const conteudo = decisaoSolicitacaoEmail({
        cursoTitulo: curso.title,
        aprovado: parsed.data.decisao === 'approved',
        url: `${process.env.NEXT_PUBLIC_SITE_URL}/curso/${curso.slug}`,
      })
      await sendEmail({ to: solicitante.email, ...conteudo })
    }

    revalidatePath('/admin/solicitacoes')
    revalidatePath('/')
    return ok(null)
  } catch (error) {
    return toActionError(error)
  }
}
```

- [ ] **Step 2: Criar o botão de solicitar acesso**

Crie `src/components/catalog/request-access-form.tsx`:

```typescript
'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { requestAccess } from '@/server/access-requests'

export function RequestAccessForm({
  courseSlug,
  jaSolicitado,
}: {
  courseSlug: string
  jaSolicitado: boolean
}) {
  const [state, action, pending] = useActionState(requestAccess, null)

  if (jaSolicitado || state?.ok) {
    return (
      <p className="mt-6 text-sm text-sucesso">
        Solicitação enviada. Você recebe um e-mail assim que o administrador decidir.
      </p>
    )
  }

  return (
    <form action={action} className="mt-6 flex flex-col gap-3">
      <input type="hidden" name="courseSlug" value={courseSlug} />
      <label htmlFor="message" className="sr-only">
        Por que você precisa deste curso?
      </label>
      <textarea
        id="message"
        name="message"
        rows={2}
        maxLength={500}
        placeholder="Por que você precisa deste curso? (opcional)"
        className="w-full rounded-lg border border-borda bg-superficie px-3 py-2 text-sm"
      />
      {state && !state.ok && (
        <p role="alert" className="text-xs text-perigo">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? 'Enviando…' : 'Solicitar acesso'}
      </Button>
    </form>
  )
}
```

Substitua `src/components/catalog/locked-course.tsx` para incluí-lo:

```typescript
import type { CourseView } from '@/server/viewer'
import { RequestAccessForm } from './request-access-form'

export function LockedCourse({
  course,
  requestStatus,
}: {
  course: CourseView
  requestStatus: 'none' | 'pending'
}) {
  return (
    <div className="mx-auto max-w-lg rounded-card border border-borda bg-superficie p-8 text-center">
      <span aria-hidden className="text-3xl">
        🔒
      </span>
      <h1 className="mt-3 text-lg font-semibold">{course.title}</h1>
      <p className="mt-1 text-xs text-texto-suave">{course.areaName ?? 'Trilha inicial'}</p>
      {course.description && <p className="mt-4 text-sm text-texto-suave">{course.description}</p>}
      <p className="mt-6 text-sm text-texto-suave">Você ainda não tem acesso a este curso.</p>
      <RequestAccessForm courseSlug={course.slug} jaSolicitado={requestStatus === 'pending'} />
    </div>
  )
}
```

Em `src/app/(app)/curso/[slug]/page.tsx`, descubra se já existe pendência e passe adiante:

```typescript
import { getCurrentUser } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'

// dentro do componente, antes do return do curso bloqueado:
if (course.access === 'none') {
  const user = await getCurrentUser()
  const supabase = await createServerSupabase()
  const { data: pendente } = await supabase
    .from('access_requests')
    .select('id')
    .eq('user_id', user!.id)
    .eq('course_id', course.id)
    .eq('status', 'pending')
    .maybeSingle()

  return <LockedCourse course={course} requestStatus={pendente ? 'pending' : 'none'} />
}
```

- [ ] **Step 3: Criar a fila do admin**

Crie `src/app/(admin)/admin/solicitacoes/request-row.tsx`:

```typescript
'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { decideAccessRequest, type PendingRequest } from '@/server/access-requests'

const formatador = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
})

export function RequestRow({ request }: { request: PendingRequest }) {
  const [state, action, pending] = useActionState(decideAccessRequest, null)

  return (
    <li className="flex flex-col gap-3 rounded-card border border-borda bg-superficie p-4 md:flex-row md:items-center">
      <div className="flex-1">
        <p className="text-sm font-medium">
          {request.personName} → {request.courseTitle}
        </p>
        <p className="text-xs text-texto-suave">
          {request.personEmail}
          {request.areaName ? ` · ${request.areaName}` : ''} ·{' '}
          {formatador.format(new Date(request.createdAt))}
        </p>
        {request.message && (
          <p className="mt-2 whitespace-pre-line text-sm text-texto-suave">“{request.message}”</p>
        )}
        {state && !state.ok && (
          <p role="alert" className="mt-1 text-xs text-perigo">
            {state.error}
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <form action={action}>
          <input type="hidden" name="id" value={request.id} />
          <input type="hidden" name="decisao" value="approved" />
          <Button type="submit" disabled={pending} className="px-3 py-1 text-xs">
            Aprovar
          </Button>
        </form>
        <form action={action}>
          <input type="hidden" name="id" value={request.id} />
          <input type="hidden" name="decisao" value="denied" />
          <Button type="submit" variant="secundario" disabled={pending} className="px-3 py-1 text-xs">
            Negar
          </Button>
        </form>
      </div>
    </li>
  )
}
```

Crie `src/app/(admin)/admin/solicitacoes/page.tsx`:

```typescript
import { listAccessRequests } from '@/server/access-requests'
import { RequestRow } from './request-row'

export const metadata = { title: 'Solicitações — GEX Academy' }

export default async function SolicitacoesPage() {
  const requests = await listAccessRequests()

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-semibold">Solicitações de acesso</h1>
      <p className="mb-6 mt-1 text-sm text-texto-suave">
        {requests.length === 0
          ? 'Nenhuma solicitação pendente.'
          : `${requests.length} ${requests.length === 1 ? 'pedido aguardando' : 'pedidos aguardando'} sua decisão.`}
      </p>

      <ul className="flex flex-col gap-3">
        {requests.map((request) => (
          <RequestRow key={request.id} request={request} />
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Rodar tudo**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(acesso): solicitacao pelo cadeado e fila de aprovacao do admin"
```

---

### Task 6: Painel de acompanhamento

**Files:**
- Create: `src/server/dashboard.ts`
- Create: `src/app/(admin)/admin/progresso/page.tsx`

**Interfaces:**
- Consumes: `getCurrentUser`, `canAccessCourse`, `progressPercent`, `createAdminSupabase`.
- Produces:
  - `type PersonProgress = { userId: string; name: string; areaName: string | null; onboardingConcluido: boolean; concluidas: number; disponiveis: number; percent: number }`
  - `type CourseStats = { courseId: string; title: string; areaName: string | null; comAcesso: number; concluiram: number; percent: number }`
  - `getDashboard(): Promise<{ pessoas: PersonProgress[]; cursos: CourseStats[] }>`

- [ ] **Step 1: Implementar o painel**

Crie `src/server/dashboard.ts`:

```typescript
'use server'

import { canAccessCourse, type AccessUser } from '@/lib/access'
import { getCurrentUser } from '@/lib/auth/session'
import { progressPercent } from '@/lib/progress/percent'
import { createAdminSupabase } from '@/lib/supabase/admin'

export type PersonProgress = {
  userId: string
  name: string
  areaName: string | null
  onboardingConcluido: boolean
  concluidas: number
  disponiveis: number
  percent: number
}

export type CourseStats = {
  courseId: string
  title: string
  areaName: string | null
  comAcesso: number
  concluiram: number
  percent: number
}

/**
 * Painel de acompanhamento.
 *
 * Roda com a chave de serviço porque precisa somar o progresso de todo mundo —
 * o que as políticas RLS, corretamente, impedem um usuário comum de fazer.
 * Por isso a primeira linha checa o papel: sem admin ou líder ativo, devolve vazio.
 *
 * "Disponíveis" é calculado por pessoa: para cada uma, quantas aulas publicadas
 * existem nos cursos que ELA pode acessar. Somar todas as aulas da plataforma
 * puniria quem tem menos cursos liberados.
 */
export async function getDashboard(): Promise<{ pessoas: PersonProgress[]; cursos: CourseStats[] }> {
  const atual = await getCurrentUser()
  if (!atual || atual.status !== 'active' || atual.role === 'member') {
    return { pessoas: [], cursos: [] }
  }

  const admin = createAdminSupabase()

  const [{ data: perfis }, { data: cursos }, { data: liberacoes }, { data: progresso }] =
    await Promise.all([
      admin
        .from('profiles')
        .select('id, full_name, role, area_id, status, areas(name)')
        .eq('status', 'active')
        .order('full_name'),
      admin
        .from('courses')
        .select('id, title, area_id, status, is_onboarding, areas(name), lessons(id, status)'),
      admin.from('course_access').select('user_id, course_id'),
      admin.from('lesson_progress').select('user_id, lesson_id'),
    ])

  type LinhaCurso = {
    id: string
    title: string
    area_id: string | null
    status: string
    is_onboarding: boolean
    areas: { name: string } | null
    lessons: { id: string; status: string }[]
  }

  const listaCursos = (cursos ?? []) as unknown as LinhaCurso[]

  const aulasPorCurso = new Map<string, string[]>()
  for (const curso of listaCursos) {
    aulasPorCurso.set(
      curso.id,
      curso.lessons.filter((l) => l.status === 'published').map((l) => l.id),
    )
  }

  const liberacoesPorUsuario = new Map<string, Set<string>>()
  for (const linha of liberacoes ?? []) {
    const atualSet = liberacoesPorUsuario.get(linha.user_id) ?? new Set<string>()
    atualSet.add(linha.course_id)
    liberacoesPorUsuario.set(linha.user_id, atualSet)
  }

  const concluidasPorUsuario = new Map<string, Set<string>>()
  for (const linha of progresso ?? []) {
    const atualSet = concluidasPorUsuario.get(linha.user_id) ?? new Set<string>()
    atualSet.add(linha.lesson_id)
    concluidasPorUsuario.set(linha.user_id, atualSet)
  }

  const cursoOnboarding = listaCursos.find((c) => c.is_onboarding && c.status === 'published')
  const aulasOnboarding = cursoOnboarding ? (aulasPorCurso.get(cursoOnboarding.id) ?? []) : []

  type LinhaPerfil = {
    id: string
    full_name: string
    role: string
    area_id: string | null
    status: string
    areas: { name: string } | null
  }

  const listaPerfis = ((perfis ?? []) as unknown as LinhaPerfil[]).filter(
    (p) => atual.role === 'admin' || p.area_id === atual.areaId,
  )

  const pessoas: PersonProgress[] = listaPerfis.map((perfil) => {
    const usuario: AccessUser = {
      id: perfil.id,
      role: perfil.role as AccessUser['role'],
      status: 'active',
      areaId: perfil.area_id,
    }
    const liberados = liberacoesPorUsuario.get(perfil.id) ?? new Set<string>()
    const concluidasDaPessoa = concluidasPorUsuario.get(perfil.id) ?? new Set<string>()

    const aulasDisponiveis = listaCursos
      .filter(
        (curso) =>
          canAccessCourse(
            usuario,
            {
              id: curso.id,
              areaId: curso.area_id,
              status: curso.status as 'draft' | 'published',
              isOnboarding: curso.is_onboarding,
            },
            liberados,
          ) !== 'none',
      )
      .flatMap((curso) => aulasPorCurso.get(curso.id) ?? [])

    const concluidas = aulasDisponiveis.filter((id) => concluidasDaPessoa.has(id)).length

    return {
      userId: perfil.id,
      name: perfil.full_name,
      areaName: perfil.areas?.name ?? null,
      onboardingConcluido:
        aulasOnboarding.length > 0 && aulasOnboarding.every((id) => concluidasDaPessoa.has(id)),
      concluidas,
      disponiveis: aulasDisponiveis.length,
      percent: progressPercent(concluidas, aulasDisponiveis.length),
    }
  })

  const cursosVisiveis = listaCursos.filter(
    (curso) =>
      curso.status === 'published' && (atual.role === 'admin' || curso.area_id === atual.areaId),
  )

  const cursosStats: CourseStats[] = cursosVisiveis.map((curso) => {
    const aulas = aulasPorCurso.get(curso.id) ?? []

    const comAcesso = listaPerfis.filter((perfil) =>
      canAccessCourse(
        {
          id: perfil.id,
          role: perfil.role as AccessUser['role'],
          status: 'active',
          areaId: perfil.area_id,
        },
        {
          id: curso.id,
          areaId: curso.area_id,
          status: curso.status as 'draft' | 'published',
          isOnboarding: curso.is_onboarding,
        },
        liberacoesPorUsuario.get(perfil.id) ?? new Set<string>(),
      ) !== 'none',
    )

    const concluiram =
      aulas.length === 0
        ? 0
        : comAcesso.filter((perfil) => {
            const concluidasDaPessoa = concluidasPorUsuario.get(perfil.id) ?? new Set<string>()
            return aulas.every((id) => concluidasDaPessoa.has(id))
          }).length

    return {
      courseId: curso.id,
      title: curso.title,
      areaName: curso.is_onboarding ? 'Trilha inicial' : (curso.areas?.name ?? null),
      comAcesso: comAcesso.length,
      concluiram,
      percent: progressPercent(concluiram, comAcesso.length),
    }
  })

  return {
    pessoas: pessoas.sort((a, b) => a.percent - b.percent),
    cursos: cursosStats.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')),
  }
}
```

- [ ] **Step 2: Criar a tela do painel**

Crie `src/app/(admin)/admin/progresso/page.tsx`:

```typescript
import { ProgressBar } from '@/components/progress/progress-bar'
import { getDashboard } from '@/server/dashboard'

export const metadata = { title: 'Progresso — GEX Academy' }

export default async function ProgressoPage() {
  const { pessoas, cursos } = await getDashboard()
  const onboardingPendente = pessoas.filter((p) => !p.onboardingConcluido)

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h1 className="text-xl font-semibold">Progresso</h1>
        <p className="mt-1 text-sm text-texto-suave">
          {onboardingPendente.length === 0
            ? 'Todo mundo concluiu a trilha inicial.'
            : `${onboardingPendente.length} ${onboardingPendente.length === 1 ? 'pessoa ainda não concluiu' : 'pessoas ainda não concluíram'} a trilha inicial.`}
        </p>
      </section>

      {onboardingPendente.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-texto-suave">
            Trilha inicial pendente
          </h2>
          <ul className="divide-y divide-borda rounded-card border border-borda bg-superficie">
            {onboardingPendente.map((pessoa) => (
              <li key={pessoa.userId} className="px-4 py-3 text-sm">
                {pessoa.name}
                <span className="text-xs text-texto-suave">
                  {pessoa.areaName ? ` · ${pessoa.areaName}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-texto-suave">
          Por pessoa
        </h2>
        <ul className="divide-y divide-borda rounded-card border border-borda bg-superficie">
          {pessoas.map((pessoa) => (
            <li key={pessoa.userId} className="px-4 py-3">
              <p className="text-sm font-medium">
                {pessoa.name}
                <span className="ml-2 text-xs font-normal text-texto-suave">
                  {pessoa.areaName ?? 'Sem área'}
                </span>
              </p>
              <div className="mt-2 max-w-md">
                <ProgressBar completed={pessoa.concluidas} total={pessoa.disponiveis} />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-texto-suave">
          Por curso
        </h2>
        <ul className="divide-y divide-borda rounded-card border border-borda bg-superficie">
          {cursos.map((curso) => (
            <li key={curso.courseId} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1">
                <p className="text-sm font-medium">{curso.title}</p>
                <p className="text-xs text-texto-suave">{curso.areaName ?? 'Sem área'}</p>
              </div>
              <p className="text-sm">
                {curso.concluiram} de {curso.comAcesso}
                <span className="ml-2 text-xs text-texto-suave">({curso.percent}%)</span>
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
```

- [ ] **Step 3: Rodar tudo**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(painel): progresso por pessoa e por curso, com destaque de onboarding pendente"
```

---

### Task 7: Testes finais e publicação

**Files:**
- Create: `e2e/forum-e-progresso.spec.ts`
- Create: `e2e/solicitacao-de-acesso.spec.ts`
- Create: `README.md`
- Modify: `src/app/(app)/layout.tsx` (botão de sair)
- Create: `src/components/layout/sign-out-button.tsx`

**Interfaces:**
- Consumes: tudo das tarefas anteriores.
- Produces: `<SignOutButton />`; a aplicação publicada em `academy.gexcorp.com.br`.

- [ ] **Step 1: Criar o botão de sair**

Crie `src/components/layout/sign-out-button.tsx`:

```typescript
'use client'

import { useRouter } from 'next/navigation'
import { createBrowserSupabase } from '@/lib/supabase/client'

export function SignOutButton() {
  const router = useRouter()

  async function sair() {
    await createBrowserSupabase().auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  return (
    <button onClick={sair} className="text-sm text-texto-suave hover:text-texto">
      Sair
    </button>
  )
}
```

Em `src/components/layout/app-shell.tsx`, troque o `<span>` com o nome por:

```typescript
<div className="flex items-center gap-4">
  <span className="text-sm text-texto-suave">{user.fullName}</span>
  <SignOutButton />
</div>
```

acrescentando `import { SignOutButton } from './sign-out-button'`.

- [ ] **Step 2: Escrever o E2E do fórum e do progresso**

Crie `e2e/forum-e-progresso.spec.ts`:

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

async function sair(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Sair' }).click()
  await expect(page).toHaveURL(/\/login/)
}

test('aluno pergunta, líder responde com selo de professor, aluno conclui a aula', async ({ page }) => {
  const db = adminClient()
  const stamp = Date.now()

  const area = await criarAreaDeTeste('Trafegoo')
  const emailLider = `lider-f-${stamp}@gexcorp.com.br`
  const emailAluno = `aluno-f-${stamp}@gexcorp.com.br`

  const liderId = await criarUsuarioDeTeste({
    email: emailLider,
    senha: 'senha-de-teste-123',
    fullName: 'Carlos Líder',
    role: 'leader',
    areaId: area,
  })
  await criarUsuarioDeTeste({
    email: emailAluno,
    senha: 'senha-de-teste-123',
    fullName: 'Ana Aluna',
    role: 'member',
    areaId: area,
  })

  const slugCurso = `campanhas-${stamp}`
  const { data: curso } = await db
    .from('courses')
    .insert({
      title: 'Campanhas de Performance',
      slug: slugCurso,
      area_id: area,
      owner_id: liderId,
      status: 'published',
    })
    .select('id')
    .single()

  await db.from('lessons').insert({
    course_id: curso!.id,
    title: 'Escolhendo o objetivo',
    slug: 'objetivo',
    video_provider: 'youtube',
    video_ref: 'dQw4w9WgXcQ',
    status: 'published',
  })

  // A aluna pergunta e conclui a aula.
  await entrar(page, emailAluno)
  await page.goto(`/curso/${slugCurso}/aula/objetivo`)

  await page.getByPlaceholder('Ficou com alguma dúvida nesta aula?').fill(
    'Qual objetivo vocês usam para topo de funil?',
  )
  await page.getByRole('button', { name: 'Enviar dúvida' }).click()
  await expect(page.getByText('Qual objetivo vocês usam para topo de funil?')).toBeVisible()

  await page.getByRole('button', { name: 'Marcar como concluída' }).click()
  await expect(page.getByRole('button', { name: '✓ Aula concluída' })).toBeVisible()

  await page.goto(`/curso/${slugCurso}`)
  await expect(page.getByText('1 de 1 aula concluída · 100%')).toBeVisible()

  await sair(page)

  // O líder vê a dúvida na fila e responde.
  await entrar(page, emailLider)
  await page.goto('/gerenciar/duvidas')
  await expect(page.getByText('Qual objetivo vocês usam para topo de funil?')).toBeVisible()
  await expect(page.getByText('sem resposta')).toBeVisible()

  await page.getByRole('link', { name: 'Abrir a aula e responder →' }).click()
  await page.getByPlaceholder('Escreva uma resposta…').fill('Usamos Alcance para topo de funil.')
  await page.getByRole('button', { name: 'Responder' }).click()

  await expect(page.getByText('Usamos Alcance para topo de funil.')).toBeVisible()
  await expect(page.getByText('Professor').first()).toBeVisible()
})
```

- [ ] **Step 3: Escrever o E2E da solicitação de acesso**

Crie `e2e/solicitacao-de-acesso.spec.ts`:

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

test('colaborador pede acesso, admin aprova e o curso destrava', async ({ page }) => {
  const db = adminClient()
  const stamp = Date.now()

  const areaCopy = await criarAreaDeTeste('Copyyy')
  const areaDesign = await criarAreaDeTeste('Designnn')

  const liderId = await criarUsuarioDeTeste({
    email: `lider-s-${stamp}@gexcorp.com.br`,
    senha: 'senha-de-teste-123',
    fullName: 'Líder Copy',
    role: 'leader',
    areaId: areaCopy,
  })
  const emailAdmin = `admin-s-${stamp}@gexcorp.com.br`
  const emailDesigner = `designer-s-${stamp}@gexcorp.com.br`

  await criarUsuarioDeTeste({
    email: emailAdmin,
    senha: 'senha-de-teste-123',
    fullName: 'Admin Geral',
    role: 'admin',
  })
  await criarUsuarioDeTeste({
    email: emailDesigner,
    senha: 'senha-de-teste-123',
    fullName: 'Dani Designer',
    role: 'member',
    areaId: areaDesign,
  })

  const slugCurso = `copy-persuasiva-${stamp}`
  const { data: curso } = await db
    .from('courses')
    .insert({
      title: 'Copy Persuasiva',
      slug: slugCurso,
      description: 'Fundamentos de escrita para vendas.',
      area_id: areaCopy,
      owner_id: liderId,
      status: 'published',
    })
    .select('id')
    .single()

  await db.from('lessons').insert({
    course_id: curso!.id,
    title: 'Gatilhos mentais',
    slug: 'gatilhos',
    video_provider: 'youtube',
    video_ref: 'dQw4w9WgXcQ',
    status: 'published',
  })

  // A designer encontra o cadeado e pede acesso.
  await entrar(page, emailDesigner)
  await page.goto(`/curso/${slugCurso}`)
  await expect(page.getByText('Você ainda não tem acesso a este curso.')).toBeVisible()

  await page.getByPlaceholder('Por que você precisa deste curso? (opcional)').fill(
    'Vou escrever as legendas dos criativos.',
  )
  await page.getByRole('button', { name: 'Solicitar acesso' }).click()
  await expect(page.getByText('Solicitação enviada.')).toBeVisible()

  await page.getByRole('button', { name: 'Sair' }).click()

  // O admin aprova.
  await entrar(page, emailAdmin)
  await page.goto('/admin/solicitacoes')
  await expect(page.getByText('Dani Designer → Copy Persuasiva')).toBeVisible()
  await expect(page.getByText('Vou escrever as legendas dos criativos.')).toBeVisible()
  await page.getByRole('button', { name: 'Aprovar' }).click()
  await expect(page.getByText('Nenhuma solicitação pendente.')).toBeVisible()

  await page.getByRole('button', { name: 'Sair' }).click()

  // A designer agora entra no curso.
  await entrar(page, emailDesigner)
  await page.goto(`/curso/${slugCurso}`)
  await expect(page.getByText('Gatilhos mentais')).toBeVisible()
  await expect(page.getByText('Você ainda não tem acesso a este curso.')).toHaveCount(0)
})
```

- [ ] **Step 4: Rodar a suíte inteira**

```bash
npm run db:reset
npm test
npm run test:db
npm run typecheck
npm run build
npm run test:e2e
```

Expected: PASS em todas as etapas.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test: E2E de forum, progresso e solicitacao de acesso, com botao de sair"
```

- [ ] **Step 6: Preparar o Supabase de produção**

1. Crie o projeto de produção em supabase.com, na região `sa-east-1` (São Paulo).
2. Conecte a CLI e aplique as migrations:

```bash
npx supabase link --project-ref <ref-do-projeto>
npx supabase db push
```

3. Em **Authentication → URL Configuration**, defina `Site URL` como `https://academy.gexcorp.com.br` e acrescente `https://academy.gexcorp.com.br/auth/confirm` às *Redirect URLs*.
4. Em **Authentication → Email Templates**, traduza para português os modelos de convite (*Invite user*) e de recuperação (*Reset password*), apontando o link para `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/convite` e `...&type=recovery&next=/nova-senha`.
5. Confirme em **Storage** que o bucket `lesson-attachments` existe e está privado.

- [ ] **Step 7: Configurar o Resend**

1. Adicione o domínio `gexcorp.com.br` no painel do Resend.
2. Publique os registros DNS que ele indicar (SPF, DKIM e, se oferecido, DMARC).
3. Aguarde a verificação e gere uma chave de API.
4. Envie um e-mail de teste para si mesmo pelo painel antes de seguir.

- [ ] **Step 8: Publicar na Vercel**

1. Suba o repositório para o GitHub da empresa e importe o projeto na Vercel.
2. Defina as variáveis de ambiente em *Production*:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY
EMAIL_FROM
NEXT_PUBLIC_SITE_URL=https://academy.gexcorp.com.br
```

Confira que `SUPABASE_SERVICE_ROLE_KEY` e `RESEND_API_KEY` **não** têm o prefixo `NEXT_PUBLIC_`.

3. Em *Settings → Domains*, adicione `academy.gexcorp.com.br` e crie no DNS da GEX o registro `CNAME` que a Vercel indicar.
4. Faça o deploy e aguarde o certificado HTTPS.

- [ ] **Step 9: Verificar em produção**

Percorra, no domínio real, nesta ordem:

1. Convide a si mesmo como `admin`; confirme que o e-mail chega e que a senha pode ser definida.
2. Crie uma área e um curso, publique uma aula com vídeo e um anexo.
3. Convide um colaborador de teste em outra área; confirme que ele vê a capa com cadeado e consegue solicitar acesso.
4. Aprove a solicitação e confirme que o curso destrava e que o e-mail de aprovação chega.
5. Publique uma dúvida como colaborador e responda como admin; confirme os dois e-mails.
6. Abra o link de download de um anexo, espere mais de um minuto e recarregue: o link assinado precisa ter expirado.

- [ ] **Step 10: Escrever o README**

Crie `README.md`:

```markdown
# GEX Academy

Plataforma de ensino interna da GEX. Cada líder de setor publica aulas para seus
colaboradores; todo colaborador novo começa pela trilha inicial da empresa.

## Rodando localmente

Pré-requisitos: Node 20+, Docker (para o Supabase local) e a Supabase CLI.

```bash
npm install
npm run db:start          # sobe o Supabase local e imprime as chaves
cp .env.local.example .env.local
# preencha .env.local com os valores impressos pelo db:start
npm run db:reset          # aplica as migrations
npm run db:types          # gera os tipos do banco
npm run dev
```

Crie o primeiro admin pelo Studio local (http://127.0.0.1:54323): adicione um
usuário em Authentication e depois uma linha em `profiles` com `role = 'admin'`
e `status = 'active'`.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm test` | Testes unitários (Vitest) |
| `npm run test:db` | Testes de integração com o banco — exige o Supabase local |
| `npm run test:e2e` | Testes de ponta a ponta (Playwright) |
| `npm run typecheck` | Verificação de tipos |
| `npm run db:reset` | Recria o banco local aplicando todas as migrations |
| `npm run db:types` | Regenera `src/lib/supabase/database.types.ts` |

## Onde as coisas moram

- `src/lib/access/` — a regra de quem acessa o quê. **Ao mudar aqui, mude também
  as políticas em `supabase/migrations/0003_politicas_rls.sql`.**
- `src/lib/video/` — interpreta link do YouTube e código do VTurb.
- `src/lib/email/` — templates e envio pelo Resend.
- `src/server/` — server actions por domínio. Nenhum componente de tela fala com
  o Supabase direto.
- `supabase/migrations/` — schema versionado.

## Documentação

- Spec: `docs/superpowers/specs/2026-08-31-gex-academy-design.md`
- Planos: `docs/superpowers/plans/`
```

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "docs: README com instrucoes de desenvolvimento e publicacao"
```

---

## Encerramento do MVP

Com as três fases concluídas, a GEX Academy está no ar: o admin convida pessoas e organiza áreas, cada líder publica seus cursos com vídeo e material, o colaborador percorre a trilha inicial e o conteúdo do seu setor, tira dúvidas com o professor, e quem se interessa por outra área pede acesso com um clique.

Fora do MVP, prontos para uma próxima rodada: certificados, quizzes, busca global, notificações dentro do app, pré-requisitos entre cursos, exportação de relatórios, login com Google e aplicativo mobile.
