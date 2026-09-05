'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { canAccessCourse } from '@/lib/access'
import { getCurrentUser } from '@/lib/auth/session'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createServerSupabase } from '@/lib/supabase/server'
import { ok, toActionError, type ActionResult } from './result'
import { getCourseView } from './viewer'

/**
 * Ids das aulas que a pessoa já concluiu dentro de um curso.
 *
 * Verifica o acesso por conta própria, e não confia em quem chamou: este
 * arquivo é 'use server', então cada export é um endpoint que qualquer pessoa
 * logada pode invocar com o id de curso que quiser (mesmo raciocínio do
 * comentário em listAttachments, src/server/attachments.ts). O embed
 * `lessons!inner(course_id)` já herda a RLS de `lessons_leitura` — mas isso
 * barra a LEITURA de aula alheia, não confirma que o `courseId` recebido é
 * sequer um curso de verdade nem responde "a pessoa acessa este curso" antes
 * de gastar a consulta; a checagem aqui é a mesma dupla camada usada em todo
 * outro endpoint do projeto: valida a forma do id, resolve o curso com o
 * cliente admin (para enxergar rascunho também, do jeito que canAccessCourse
 * precisa decidir), e só consulta o progresso se o nível de acesso não for
 * 'none'.
 */
export async function getCompletedLessonIds(courseId: string): Promise<Set<string>> {
  const user = await getCurrentUser()
  if (!user || user.status !== 'active') return new Set()

  const idValido = z.string().uuid().safeParse(courseId)
  if (!idValido.success) return new Set()

  const admin = createAdminSupabase()
  const { data: curso } = await admin
    .from('courses')
    .select('id, area_id, status, is_onboarding')
    .eq('id', idValido.data)
    .maybeSingle()
  if (!curso) return new Set()

  const supabaseUsuario = await createServerSupabase()
  const [{ data: liberacoes }, { data: areasExtras }] = await Promise.all([
    supabaseUsuario.from('course_access').select('course_id').eq('user_id', user.id),
    supabaseUsuario.from('area_access').select('area_id').eq('user_id', user.id),
  ])

  const nivel = canAccessCourse(
    user,
    {
      id: curso.id,
      areaId: curso.area_id,
      status: curso.status as 'draft' | 'published',
      isOnboarding: curso.is_onboarding,
    },
    new Set((liberacoes ?? []).map((l) => l.course_id)),
    new Set((areasExtras ?? []).map((a) => a.area_id)),
  )
  if (nivel === 'none') return new Set()

  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('lesson_progress')
    .select('lesson_id, lessons!inner(course_id)')
    .eq('user_id', user.id)
    .eq('lessons.course_id', idValido.data)

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
