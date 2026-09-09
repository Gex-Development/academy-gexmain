// Sem 'use server': lógica pura (mapeamento de linha e a decisão de acesso)
// extraída de viewer.ts para ficar importável por um teste de banco — mesmo
// motivo documentado em courses-query.ts e catalog-query.ts. Um arquivo
// 'use server' só pode exportar funções async; sem este arquivo, a única
// forma de provar que um curso BLOQUEADO devolve `lessons: []` (mesmo que a
// linha do banco venha com aulas populadas) seria chamar getCourseView()
// diretamente, o que exige cookies() de um request Next.js de verdade
// (createServerSupabase() → next/headers) e lança "called outside a request
// scope" fora dele.
//
// Com este arquivo, tests/db/viewer.test.ts roda a MESMA consulta
// (SELECT_CURSO_VIEW) e a MESMA função de mapeamento (paraCourseView, logo
// canAccessCourse também) que getCourseView() usa em produção, contra o
// Postgres de verdade — autenticado como alguém sem acesso ao curso, e como
// um colega da própria área de um curso em rascunho — em vez de reimplementar
// a conta em paralelo e provar a suposição do teste, não o código real.
import { canAccessCourse, type AccessLevel, type AccessUser } from '@/lib/access'
import type { VideoProvider } from '@/lib/video'

export type CourseView = {
  id: string
  slug: string
  title: string
  description: string | null
  coverUrl: string | null
  areaName: string | null
  /** Slug da ÁREA (não do curso). Serve ao link de voltar da tela do curso. */
  areaSlug: string | null
  areaColor: string | null
  isOnboarding: boolean
  access: AccessLevel
  lessons: { id: string; slug: string; title: string; durationSeconds: number | null }[]
}

export type LessonDetail = {
  id: string
  slug: string
  title: string
  description: string | null
  provider: VideoProvider
  ref: string
  durationSeconds: number | null
}

export type LessonView = {
  course: CourseView
  lesson: LessonDetail
  anterior: string | null
  proxima: string | null
}

export const SELECT_CURSO_VIEW =
  'id, slug, title, description, cover_url, status, is_onboarding, area_id, areas(name, slug, color), lessons(id, slug, title, duration_seconds, status, position)'

export type LinhaCursoView = {
  id: string
  slug: string
  title: string
  description: string | null
  cover_url: string | null
  status: string
  is_onboarding: boolean
  area_id: string | null
  areas: { name: string; slug: string; color: string | null } | null
  lessons: {
    id: string
    slug: string
    title: string
    duration_seconds: number | null
    status: string
    position: number
  }[]
}

/**
 * Curso do aluno.
 *
 * Quando o acesso é 'none', devolve os metadados (para a tela do cadeado) mas
 * com `lessons` SEMPRE vazio — mesmo que `row.lessons` venha com linhas — a
 * lista de aulas já é conteúdo. O RLS de `lessons` (0004_corrige_leitura_de_
 * aulas.sql) já barra essa linha na consulta para quem não tem acesso; este
 * `access === 'none' ? [] : ...` é a segunda camada, e é ela que continua
 * segura mesmo que a primeira algum dia regrida.
 *
 * Rascunho é invisível para quem não gerencia — nem a capa aparece. O RLS de
 * `courses` (courses_leitura) já garante isso na maioria dos casos (a linha
 * nem chega até aqui), mas repetimos a checagem porque é lógica de aplicação
 * barata e testável sem request Next.js — o mesmo padrão de dupla camada que
 * listAttachments (src/server/attachments.ts) já usa.
 */
export function paraCourseView(
  row: LinhaCursoView,
  user: AccessUser,
  grantedCourseIds: ReadonlySet<string>,
  grantedAreaIds: ReadonlySet<string> = new Set(),
): CourseView | null {
  const access = canAccessCourse(
    user,
    {
      id: row.id,
      areaId: row.area_id,
      status: row.status as 'draft' | 'published',
      isOnboarding: row.is_onboarding,
    },
    grantedCourseIds,
    grantedAreaIds,
  )

  if (row.status !== 'published' && access !== 'manage') return null

  const lessons =
    access === 'none'
      ? []
      : [...row.lessons]
          .filter((l) => l.status === 'published' || access === 'manage')
          .sort((a, b) => a.position - b.position)
          .map((l) => ({ id: l.id, slug: l.slug, title: l.title, durationSeconds: l.duration_seconds }))

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    coverUrl: row.cover_url,
    areaName: row.areas?.name ?? null,
    areaSlug: row.areas?.slug ?? null,
    areaColor: row.areas?.color ?? null,
    isOnboarding: row.is_onboarding,
    access,
    lessons,
  }
}

export const SELECT_AULA_VIEW = 'id, slug, title, description, video_provider, video_ref, duration_seconds'

export type LinhaAulaView = {
  id: string
  slug: string
  title: string
  description: string | null
  video_provider: string
  video_ref: string
  duration_seconds: number | null
}

export function paraLessonDetail(row: LinhaAulaView): LessonDetail {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    provider: row.video_provider as VideoProvider,
    ref: row.video_ref,
    durationSeconds: row.duration_seconds,
  }
}

/**
 * Posição de uma aula na lista JÁ FILTRADA/ordenada de `CourseView.lessons`,
 * e os vizinhos para os links de anterior/próxima.
 *
 * Recebe a lista pronta (não a linha crua) de propósito: se o slug pedido
 * pertencer a uma aula em rascunho (para quem só tem 'view') ou a uma aula de
 * outro curso, ele simplesmente não está nessa lista — `indexOf` dá -1 e a
 * função devolve null, sem precisar repetir nenhuma regra de acesso aqui.
 */
export function acharNavegacao(
  lessons: readonly { slug: string }[],
  lessonSlug: string,
): { indice: number; anterior: string | null; proxima: string | null } | null {
  const indice = lessons.findIndex((l) => l.slug === lessonSlug)
  if (indice === -1) return null

  return {
    indice,
    anterior: indice > 0 ? lessons[indice - 1]!.slug : null,
    proxima: indice < lessons.length - 1 ? lessons[indice + 1]!.slug : null,
  }
}
