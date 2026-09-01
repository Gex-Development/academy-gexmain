// Sem 'use server': funções e constantes puras (consulta, mapeamento e a
// regra de publicação) extraídas de courses.ts para ficarem importáveis por
// um teste de banco.
//
// courses.ts precisou ficar só com funções async — um arquivo 'use server'
// só pode exportar funções async (Next.js recusa o build inteiro, "The
// module has no exports at all", se qualquer export não for uma função
// async: confirmado tentando exportar SELECT_CURSO/paraManagedCourse/
// podePublicar direto de lá). Sem este arquivo, a única forma de testar a
// regra de publicação (setCourseStatus, "nunca com zero aulas publicadas")
// seria chamar a server action diretamente, o que exige cookies() de um
// request Next.js de verdade (createServerSupabase → next/headers) e lança
// "called outside a request scope" fora dele — confirmado experimentalmente.
// Com este arquivo, tests/db/courses.test.ts roda a MESMA consulta
// (SELECT_CURSO) e o MESMO mapeamento (paraManagedCourse) e a MESMA decisão
// (podePublicar) que a action usa, contra o Postgres de verdade, sem precisar
// simular um request.
import type { CourseStatus } from '@/lib/access'

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

export const SELECT_CURSO =
  'id, slug, title, description, cover_url, status, is_onboarding, area_id, areas(name), lessons(id, status)'

export type LinhaCurso = {
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

export function paraManagedCourse(row: LinhaCurso): ManagedCourse {
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

/**
 * Regra de publicação: nunca com zero aulas publicadas (capa bonita levando a
 * curso vazio é pior do que curso nenhum). É lógica de aplicação pura, sem
 * espelho no banco (nenhuma constraint/trigger em courses/lessons impede
 * status='published' com zero aulas publicadas) — por isso extraída e
 * exportada, para o teste de banco poder chamar exatamente esta função, e não
 * reimplementar a mesma conta em paralelo (o que provaria a suposição do
 * teste, não o código real).
 */
export function podePublicar(curso: Pick<ManagedCourse, 'publishedLessonCount'>): boolean {
  return curso.publishedLessonCount > 0
}
