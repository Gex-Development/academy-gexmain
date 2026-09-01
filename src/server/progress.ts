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

/**
 * Alterna a conclusão de uma aula para a pessoa logada.
 *
 * Confirma o acesso ao curso em código de aplicação (via getCourseView, a
 * MESMA função que a página do curso usa) antes de gravar — defesa em
 * profundidade: a política progresso_proprio (0008_revisao_de_fase.sql) já
 * exige can_access_course no WITH CHECK do banco, então uma tentativa de
 * marcar aula de curso bloqueado seria recusada ali também (42501), mas essa
 * checagem aqui evita a viagem ao banco e devolve uma mensagem melhor.
 */
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
