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
