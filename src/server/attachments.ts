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
