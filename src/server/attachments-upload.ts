// Sem 'use server': as duas funções abaixo conversam de verdade com o
// Storage (mint da URL assinada e confirmação do upload direto do
// navegador), mas não dependem de cookies() — diferente de getLessonForEdit,
// que faz a checagem de PERMISSÃO e continua em attachments.ts. Mesmo
// raciocínio de courses-query.ts: o que não precisa de cookies() sai para um
// módulo à parte, para um teste de banco poder chamar a MESMA função que a
// action usa, contra o Storage de verdade, sem precisar simular um request
// Next.js (createServerSupabase() lança "called outside a request scope"
// fora de um request de verdade — confirmado em courses.test.ts).
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { ATTACHMENT_BUCKET, buildAttachmentPath, validateAttachment } from '@/lib/storage/attachments'
import { fail, ok, type ActionResult } from './result'

type AdminClient = SupabaseClient<Database>

/**
 * Gera a URL de upload assinada, direto para o Storage — o arquivo em si
 * nunca passa pelo servidor Next.js. Valida os metadados DECLARADOS pelo
 * cliente antes de mintar qualquer coisa (recusa antes, nunca depois), mas
 * essa validação é só a primeira barreira: um cliente pode declarar "2 MB,
 * application/pdf" e depois mandar outra coisa. verifyAndRegisterAttachment
 * é quem cobra a validação de verdade, contra o que o Storage realmente
 * recebeu.
 */
export async function mintAttachmentUpload(
  admin: AdminClient,
  lessonId: string,
  file: { name: string; type: string; size: number },
): Promise<ActionResult<{ path: string; token: string }>> {
  const erro = validateAttachment(file)
  if (erro) return fail(erro)

  const path = buildAttachmentPath(lessonId, file.name)
  const { data, error } = await admin.storage.from(ATTACHMENT_BUCKET).createSignedUploadUrl(path)
  if (error) throw error
  if (!data) return fail('Não foi possível iniciar o envio do arquivo.')

  return ok({ path: data.path, token: data.token })
}

export type RegisterAttachmentInput = {
  lessonId: string
  path: string
  fileName: string
  uploadedBy: string
}

/**
 * Confirma o upload feito direto pelo navegador e só então cria a linha.
 * Não confia no tamanho nem no tipo que o cliente declarou ao pedir a URL —
 * pergunta ao próprio Storage (`info()`) o que chegou de verdade, e valida
 * ISSO. Sem este passo, tirar o upload do servidor teria tirado a validação
 * junto: bastaria declarar um tamanho pequeno e mandar um arquivo enorme.
 *
 * Também confere que o caminho devolvido pelo cliente ainda pertence à
 * pasta desta aula — o valor volta do navegador entre o mint e a
 * confirmação, então não é dado em que confiar sem checar de novo.
 *
 * Em caso de falha (validação ou erro ao gravar a linha), remove o objeto do
 * bucket — mesma lógica de rollback que já existia no upload de servidor.
 */
export async function verifyAndRegisterAttachment(
  admin: AdminClient,
  input: RegisterAttachmentInput,
): Promise<ActionResult<{ id: string }>> {
  if (!input.path.startsWith(`${input.lessonId}/`)) {
    return fail('Caminho de upload inválido.')
  }

  const { data: info, error: infoError } = await admin.storage.from(ATTACHMENT_BUCKET).info(input.path)
  if (infoError || !info) return fail('Não foi possível confirmar o envio do arquivo.')

  const tamanhoReal = info.size ?? 0
  const tipoReal = info.contentType ?? ''
  const erro = validateAttachment({ name: input.fileName, type: tipoReal, size: tamanhoReal })
  if (erro) {
    await admin.storage.from(ATTACHMENT_BUCKET).remove([input.path])
    return fail(erro)
  }

  const { data, error } = await admin
    .from('lesson_attachments')
    .insert({
      lesson_id: input.lessonId,
      file_name: input.fileName,
      storage_path: input.path,
      mime_type: tipoReal,
      size_bytes: tamanhoReal,
      uploaded_by: input.uploadedBy,
    })
    .select('id')
    .single()

  if (error) {
    // Sem a linha no banco o arquivo fica órfão no bucket: remove.
    await admin.storage.from(ATTACHMENT_BUCKET).remove([input.path])
    throw error
  }

  return ok({ id: data.id })
}
