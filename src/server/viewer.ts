'use server'

import { getCurrentUser } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import {
  acharNavegacao,
  paraCourseView,
  paraLessonDetail,
  SELECT_AULA_VIEW,
  SELECT_CURSO_VIEW,
  type CourseView,
  type LessonView,
  type LinhaAulaView,
  type LinhaCursoView,
} from './viewer-query'

// Um arquivo 'use server' só pode exportar funções async — por isso os tipos
// e a lógica de mapeamento/decisão moram em viewer-query.ts (ver comentário
// lá). Aqui só o tipo (apagado em tempo de compilação, não conta como export
// de runtime) é reexportado, para quem importa `type CourseView`/`LessonView`
// daqui continuar funcionando — é o caso das páginas em src/app/(app)/curso.
export type { CourseView, LessonView }

/**
 * Carrega um curso para o aluno.
 *
 * Quando o acesso é 'none', devolve os metadados (para a tela do cadeado) mas
 * com `lessons` vazio. A lista de aulas já é conteúdo.
 *
 * Função pura de rede: é ela quem estabelece quem está chamando (nenhum
 * componente sob src/app ou src/components faz isso).
 */
export async function getCourseView(slug: string): Promise<CourseView | null> {
  const user = await getCurrentUser()
  if (!user || user.status !== 'active') return null

  const supabase = await createServerSupabase()

  const [{ data }, { data: liberacoes }] = await Promise.all([
    supabase.from('courses').select(SELECT_CURSO_VIEW).eq('slug', slug).maybeSingle(),
    supabase.from('course_access').select('course_id').eq('user_id', user.id),
  ])
  if (!data) return null

  return paraCourseView(
    data as unknown as LinhaCursoView,
    user,
    new Set((liberacoes ?? []).map((l) => l.course_id)),
  )
}

/**
 * Carrega uma aula para o aluno, com o curso (já autorizado) e a navegação
 * anterior/próxima.
 *
 * Reusa getCourseView() para decidir o acesso: se o curso está bloqueado, ou
 * se o slug pedido não está na lista de aulas que o aluno pode ver (aula em
 * rascunho, aula de outro curso, slug inexistente), devolve null — o mesmo
 * 404 de uma aula que não existe, sem diferenciar os dois casos para quem
 * está do lado de fora.
 */
export async function getLessonView(
  courseSlug: string,
  lessonSlug: string,
): Promise<LessonView | null> {
  const course = await getCourseView(courseSlug)
  if (!course || course.access === 'none') return null

  const navegacao = acharNavegacao(course.lessons, lessonSlug)
  if (!navegacao) return null

  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('lessons')
    .select(SELECT_AULA_VIEW)
    .eq('course_id', course.id)
    .eq('slug', lessonSlug)
    .maybeSingle()
  if (!data) return null

  return {
    course,
    lesson: paraLessonDetail(data as unknown as LinhaAulaView),
    anterior: navegacao.anterior,
    proxima: navegacao.proxima,
  }
}
