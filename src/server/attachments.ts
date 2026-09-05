'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { canAccessCourse } from '@/lib/access'
import { assertRole } from '@/lib/auth/guards'
import { getCurrentUser } from '@/lib/auth/session'
import { ATTACHMENT_BUCKET } from '@/lib/storage/attachments'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createServerSupabase } from '@/lib/supabase/server'
import { podeVerAnexosDaAula } from './attachments-query'
import { mintAttachmentUpload, verifyAndRegisterAttachment } from './attachments-upload'
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

  // Aula em rascunho: material só para quem gerencia o curso.
  if (!podeVerAnexosDaAula(aula.status, nivel)) return []

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

const mintSchema = z.object({
  lessonId: z.string().uuid(),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(255),
  sizeBytes: z.coerce.number().int().positive(),
})

/**
 * Passo 1 dos dois de upload: autoriza e minta a URL assinada.
 *
 * O arquivo NUNCA passa por este servidor — Server Actions do Next.js
 * limitam o corpo da requisição a 1 MB por padrão, e o teto do runtime
 * serverless da Vercel (~4,5 MB) continua valendo mesmo se esse limite for
 * ampliado na configuração. Um material de 50 MB nunca chegaria aqui. Por
 * isso esta action só recebe METADADOS (nome, tipo, tamanho declarados) — o
 * navegador sobe os bytes direto para o Storage, com a URL assinada que ela
 * devolve (ver confirmAttachmentUpload, passo 2, que valida o que chegou de
 * verdade em vez de confiar no que foi declarado aqui).
 */
export async function createAttachmentUpload(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ path: string; token: string }>> {
  try {
    assertRole(await getCurrentUser(), ['admin', 'leader'])

    const parsed = mintSchema.safeParse({
      lessonId: formData.get('lessonId'),
      fileName: formData.get('fileName'),
      mimeType: formData.get('mimeType'),
      sizeBytes: formData.get('sizeBytes'),
    })
    if (!parsed.success) return { ok: false, error: 'Dados de upload inválidos.' }

    const lesson = await getLessonForEdit(parsed.data.lessonId)
    if (!lesson) return { ok: false, error: 'Você não tem permissão para editar esta aula.' }

    const admin = createAdminSupabase()
    return await mintAttachmentUpload(admin, parsed.data.lessonId, {
      name: parsed.data.fileName,
      type: parsed.data.mimeType,
      size: parsed.data.sizeBytes,
    })
  } catch (error) {
    return toActionError(error)
  }
}

const confirmSchema = z.object({
  lessonId: z.string().uuid(),
  path: z.string().trim().min(1).max(600),
  fileName: z.string().trim().min(1).max(255),
})

/**
 * Passo 2: depois que o navegador sobe o arquivo direto para o Storage (com
 * a URL assinada do passo 1), esta action confirma o que chegou de verdade
 * — não o que foi declarado ao mintar — e só então cria a linha.
 */
export async function confirmAttachmentUpload(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = assertRole(await getCurrentUser(), ['admin', 'leader'])

    const parsed = confirmSchema.safeParse({
      lessonId: formData.get('lessonId'),
      path: formData.get('path'),
      fileName: formData.get('fileName'),
    })
    if (!parsed.success) return { ok: false, error: 'Dados de upload inválidos.' }

    const lesson = await getLessonForEdit(parsed.data.lessonId)
    if (!lesson) return { ok: false, error: 'Você não tem permissão para editar esta aula.' }

    const admin = createAdminSupabase()
    const resultado = await verifyAndRegisterAttachment(admin, {
      lessonId: parsed.data.lessonId,
      path: parsed.data.path,
      fileName: parsed.data.fileName,
      uploadedBy: user.id,
    })

    if (resultado.ok) {
      revalidatePath(`/gerenciar/cursos/${lesson.courseId}/aulas/${parsed.data.lessonId}`)
    }
    return resultado
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
