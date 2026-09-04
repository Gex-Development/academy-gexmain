'use server'

import { z } from 'zod'
import { assertRole } from '@/lib/auth/guards'
import { getCurrentUser } from '@/lib/auth/session'
import type { CapaEscopo } from '@/lib/storage/capas'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { mintCapaUpload, verifyCapaUpload } from './capas-upload'
import { getManagedCourse } from './courses'
import { toActionError, type ActionResult } from './result'

const escopoSchema = z.enum(['area', 'curso'])

/**
 * Confere se o usuário atual pode gerenciar a capa deste escopo/id — o
 * coração da tarefa. Não confia no escopo nem no id vindos do FormData sem
 * checar contra quem está chamando.
 *
 * Área: só admin — mesma regra de updateArea (src/server/areas.ts). Não há
 * "área de ninguém": qualquer admin gerencia qualquer área, então o id não
 * precisa existir de fato para a checagem em si (updateArea também não
 * pré-checa existência — o próprio update().eq('id', ...) falha se o id não
 * bater com nenhuma linha).
 *
 * Curso: quem gerencia AQUELE curso — getManagedCourse (src/server/
 * courses.ts) já resolve exatamente essa pergunta (área do líder, ou
 * admin) e é a mesma função que updateCourse usa; nada aqui reimplementa a
 * checagem.
 */
async function podeGerenciarCapa(escopo: CapaEscopo, id: string): Promise<boolean> {
  if (escopo === 'area') {
    const user = await getCurrentUser()
    return user !== null && user.status === 'active' && user.role === 'admin'
  }
  return Boolean(await getManagedCourse(id))
}

const mintSchema = z.object({
  escopo: escopoSchema,
  id: z.string().uuid(),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(255),
  sizeBytes: z.coerce.number().int().positive(),
})

/**
 * Passo 1 dos dois de upload: autoriza e minta a URL assinada. A imagem
 * nunca passa por este servidor — o navegador sobe os bytes direto para o
 * Storage, com a URL assinada que esta action devolve (ver
 * confirmCapaUpload, passo 2, que valida o que chegou de verdade em vez de
 * confiar no que foi declarado aqui). Mesmo desenho de createAttachmentUpload
 * (src/server/attachments.ts).
 */
export async function createCapaUpload(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ path: string; token: string }>> {
  try {
    assertRole(await getCurrentUser(), ['admin', 'leader'])

    const parsed = mintSchema.safeParse({
      escopo: formData.get('escopo'),
      id: formData.get('id'),
      fileName: formData.get('fileName'),
      mimeType: formData.get('mimeType'),
      sizeBytes: formData.get('sizeBytes'),
    })
    if (!parsed.success) return { ok: false, error: 'Dados de upload inválidos.' }

    if (!(await podeGerenciarCapa(parsed.data.escopo, parsed.data.id))) {
      return { ok: false, error: 'Você não tem permissão para alterar esta capa.' }
    }

    const admin = createAdminSupabase()
    return await mintCapaUpload(admin, parsed.data.escopo, parsed.data.id, {
      name: parsed.data.fileName,
      type: parsed.data.mimeType,
      size: parsed.data.sizeBytes,
    })
  } catch (error) {
    return toActionError(error)
  }
}

const confirmSchema = z.object({
  escopo: escopoSchema,
  id: z.string().uuid(),
  path: z.string().trim().min(1).max(600),
})

/**
 * Passo 2: depois que o navegador sobe a imagem direto para o Storage (com
 * a URL assinada do passo 1), esta action confirma o que chegou de verdade
 * — não o que foi declarado ao mintar — e devolve a URL pública. Quem
 * chama ainda precisa salvar essa URL no campo coverUrl da área/curso (via
 * updateArea/updateCourse) — esta action só confirma o upload.
 *
 * Confirmar o upload NÃO apaga a capa anterior, mesmo que exista uma. Uma
 * versão anterior desta action apagava (recebia `previousUrl` e mandava
 * verifyCapaUpload remover) — quebrava sempre que alguém confirmava o
 * upload e fechava a aba sem salvar: o banco continuava apontando para uma
 * capa que essa lógica já tinha apagado. A limpeza da capa substituída
 * agora mora em updateArea/updateCourse (src/server/areas.ts, courses.ts),
 * chamada só depois que a escrita no banco já teve sucesso — ver o
 * comentário de verifyCapaUpload e de apagarCapaSubstituida em
 * capas-upload.ts para o raciocínio completo.
 *
 * A checagem de que `path` pertence à pasta de `escopo`/`id` mora dentro de
 * verifyCapaUpload, não aqui: esta action é 'use server' e exige cookies()
 * para rodar (getCurrentUser), então nenhum teste de banco alcançaria a
 * checagem se ela ficasse só aqui.
 */
export async function confirmCapaUpload(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ url: string }>> {
  try {
    assertRole(await getCurrentUser(), ['admin', 'leader'])

    const parsed = confirmSchema.safeParse({
      escopo: formData.get('escopo'),
      id: formData.get('id'),
      path: formData.get('path'),
    })
    if (!parsed.success) return { ok: false, error: 'Dados de upload inválidos.' }

    if (!(await podeGerenciarCapa(parsed.data.escopo, parsed.data.id))) {
      return { ok: false, error: 'Você não tem permissão para alterar esta capa.' }
    }

    const admin = createAdminSupabase()
    return await verifyCapaUpload(admin, parsed.data.escopo, parsed.data.id, parsed.data.path)
  } catch (error) {
    return toActionError(error)
  }
}
