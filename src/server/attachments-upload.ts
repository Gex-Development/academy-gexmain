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

/** Linha existente para um storage_path, se houver — usado para tratar uma confirmação repetida como idempotente, não como erro. */
async function buscarAnexoPorCaminho(
  admin: AdminClient,
  path: string,
): Promise<{ id: string; lessonId: string } | null> {
  const { data } = await admin
    .from('lesson_attachments')
    .select('id, lesson_id')
    .eq('storage_path', path)
    .maybeSingle()
  return data ? { id: data.id, lessonId: data.lesson_id } : null
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
 * EXCETO quando o "erro" é a linha já existir (storage_path é único): uma
 * segunda confirmação para o MESMO upload não é uma falha — é rede lenta ou
 * um cliente que reenviou por não ter visto a resposta a tempo — e nesse
 * caso o objeto pertence à confirmação ANTERIOR, já persistida. Removê-lo
 * destruiria um anexo que já funcionava; por isso o caminho de "já existe"
 * devolve sucesso (idempotente) em vez de cair no rollback genérico.
 */
export async function verifyAndRegisterAttachment(
  admin: AdminClient,
  input: RegisterAttachmentInput,
): Promise<ActionResult<{ id: string }>> {
  if (!input.path.startsWith(`${input.lessonId}/`)) {
    return fail('Caminho de upload inválido.')
  }

  // Confirmação repetida do mesmo upload: a linha já existe, o objeto já é
  // dela — não há nada a inserir, e nada a remover. Checado ANTES do
  // insert para não depender só do código de erro da constraint única.
  const existente = await buscarAnexoPorCaminho(admin, input.path)
  if (existente) {
    if (existente.lessonId === input.lessonId) return ok({ id: existente.id })
    // Colisão de storage_path que não é nossa: não deveria acontecer (o
    // caminho é único por construção — prefixo da aula + uuid aleatório) —
    // mas por segurança não mexe num objeto que não sabe se é seu.
    return fail('Não foi possível confirmar o envio do arquivo.')
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
    if (error.code === '23505') {
      // Corrida: outra confirmação para o mesmo caminho terminou entre o
      // cheque acima e este insert. Mesmo raciocínio — a linha já existe,
      // não é erro, e o objeto não é nosso para remover.
      const existenteAgora = await buscarAnexoPorCaminho(admin, input.path)
      if (existenteAgora && existenteAgora.lessonId === input.lessonId) {
        return ok({ id: existenteAgora.id })
      }
      return fail('Não foi possível confirmar o envio do arquivo.')
    }

    // Qualquer outro erro: sem a linha no banco o arquivo fica órfão no
    // bucket, remove.
    await admin.storage.from(ATTACHMENT_BUCKET).remove([input.path])
    throw error
  }

  return ok({ id: data.id })
}
