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
