// Sem 'use server': as duas funções abaixo conversam de verdade com o
// Storage (mint da URL assinada e verificação do upload direto do
// navegador), mas não dependem de cookies() — mesmo raciocínio de
// attachments-upload.ts (que por sua vez segue courses-query.ts): o que não
// precisa de cookies() sai para um módulo à parte, para um teste de banco
// poder chamar a MESMA função que a action usa, contra o Storage de
// verdade, sem precisar simular um request Next.js.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { CAPA_BUCKET, buildCapaPath, validateCapa, type CapaEscopo } from '@/lib/storage/capas'
import { fail, ok, type ActionResult } from './result'

type AdminClient = SupabaseClient<Database>

/**
 * Gera a URL de upload assinada, direto para o Storage — a imagem nunca
 * passa pelo servidor Next.js (mesmo limite de corpo de requisição que
 * justifica o desenho em attachments-upload.ts, embora aqui o arquivo já
 * seja pequeno por natureza). Valida os metadados DECLARADOS pelo cliente
 * antes de mintar qualquer coisa (recusa antes, nunca depois), mas essa
 * validação é só a primeira barreira: um cliente pode declarar "300 KB,
 * image/png" e mandar 200 MB de outra coisa. verifyCapaUpload é quem cobra
 * a validação de verdade, contra o que o Storage realmente recebeu.
 */
export async function mintCapaUpload(
  admin: AdminClient,
  escopo: CapaEscopo,
  id: string,
  file: { name: string; type: string; size: number },
): Promise<ActionResult<{ path: string; token: string }>> {
  const erro = validateCapa(file)
  if (erro) return fail(erro)

  const path = buildCapaPath(escopo, id, file.name)
  const { data, error } = await admin.storage.from(CAPA_BUCKET).createSignedUploadUrl(path)
  if (error) throw error
  if (!data) return fail('Não foi possível iniciar o envio da imagem.')

  return ok({ path: data.path, token: data.token })
}

/**
 * Verifica o que REALMENTE chegou ao Storage — não o que foi declarado ao
 * mintar — e só então devolve a URL pública. Sem este passo, tirar o upload
 * do servidor teria tirado a validação junto: bastaria declarar "300 KB,
 * PNG" e mandar 200 MB de outra coisa.
 *
 * Em caso de falha, remove o objeto do bucket — mesma lógica de rollback
 * que verifyAndRegisterAttachment já usa para anexos. Capa não tem linha
 * própria no banco (é só uma URL guardada em areas.cover_url ou
 * courses.cover_url, gravada pela action de salvar área/curso, não por
 * esta função) — por isso não há o caso de "confirmação repetida" que
 * attachments-upload.ts trata via storage_path único: aqui não existe
 * registro para colidir, só o objeto no bucket e a URL pública devolvida.
 *
 * Bucket público: a URL pública vem de getPublicUrl(), nunca montada à mão
 * (evita hardcodar o formato .../object/public/{bucket}/{path}).
 */
export async function verifyCapaUpload(
  admin: AdminClient,
  path: string,
): Promise<ActionResult<{ url: string }>> {
  const { data: info, error: infoError } = await admin.storage.from(CAPA_BUCKET).info(path)
  if (infoError || !info) return fail('Não foi possível confirmar o envio da imagem.')

  const tamanhoReal = info.size ?? 0
  const tipoReal = info.contentType ?? ''
  const erro = validateCapa({ name: path, type: tipoReal, size: tamanhoReal })
  if (erro) {
    await admin.storage.from(CAPA_BUCKET).remove([path])
    return fail(erro)
  }

  const { data } = admin.storage.from(CAPA_BUCKET).getPublicUrl(path)
  return ok({ url: data.publicUrl })
}
