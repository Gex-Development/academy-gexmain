// Sem 'use server': as duas funções abaixo conversam de verdade com o
// Storage (mint da URL assinada e verificação do upload direto do
// navegador), mas não dependem de cookies() — mesmo raciocínio de
// attachments-upload.ts (que por sua vez segue courses-query.ts): o que não
// precisa de cookies() sai para um módulo à parte, para um teste de banco
// poder chamar a MESMA função que a action usa, contra o Storage de
// verdade, sem precisar simular um request Next.js. É por isso, também, que
// a checagem de prefixo de caminho (mais abaixo, em verifyCapaUpload) mora
// AQUI, e não em capas.ts: capas.ts é 'use server' e exige cookies() para
// rodar (getCurrentUser), então nenhum teste de banco alcança o que estiver
// lá dentro — e essa checagem é exatamente o tipo de regra que precisa de
// teste direto, não só de leitura de código.
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
 * Devolve o caminho de um objeto do bucket 'capas' a partir da sua URL
 * pública, ou null se a URL não é do nosso bucket (ex.: uma URL colada de
 * fora — essa não é nossa para apagar). getPublicUrl() não tem uma função
 * inversa pronta no SDK; a extração aqui é a mesma string que getPublicUrl
 * produz, só andada de trás para a frente.
 */
function extrairCaminhoCapa(url: string): string | null {
  const prefixo = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${CAPA_BUCKET}/`
  if (!url.startsWith(prefixo)) return null
  return url.slice(prefixo.length)
}

/**
 * Verifica o que REALMENTE chegou ao Storage — não o que foi declarado ao
 * mintar — e só então devolve a URL pública. Sem este passo, tirar o upload
 * do servidor teria tirado a validação junto: bastaria declarar "300 KB,
 * PNG" e mandar 200 MB de outra coisa.
 *
 * IMPORTANTE sobre o alcance desta checagem: o `contentType` que `info()`
 * devolve é o cabeçalho que a própria requisição de upload declarou, não uma
 * inspeção dos bytes do arquivo — o Storage não abre a imagem para conferir
 * se ela é de verdade um PNG/JPEG/WebP. O que esta função pega é quem
 * declara "image/png" no mint e manda outra coisa na hora de subir (dois
 * pontos que precisam mentir a mesma mentira para escapar); o que ela NÃO
 * pega é quem declara "image/png" nos dois pontos e manda bytes que não são
 * uma imagem de verdade — é a mesma técnica, e a mesma lacuna, que
 * verifyAndRegisterAttachment já aceita para anexos (attachments-upload.ts);
 * não é uma regressão desta tarefa.
 *
 * Confere também que `path` pertence à pasta de `escopo`/`id` — o caminho
 * volta do navegador entre o mint e a confirmação, então não é dado em que
 * confiar sem checar de novo (mesma lógica de verifyAndRegisterAttachment
 * para anexos). Essa checagem estava, numa versão anterior, na action
 * ('use server') que embrulha esta função — mas lá nenhum teste de banco a
 * alcança, porque a action exige cookies(). Aqui, puro e testável, é onde
 * ela pertence.
 *
 * Em caso de falha na validação do que chegou, remove o objeto do bucket —
 * mesma lógica de rollback que verifyAndRegisterAttachment já usa para
 * anexos. Capa não tem linha própria no banco (é só uma URL guardada em
 * areas.cover_url ou courses.cover_url, gravada pela action de salvar
 * área/curso, não por esta função) — por isso não há o caso de "confirmação
 * repetida" que attachments-upload.ts trata via storage_path único: aqui
 * não existe registro para colidir, só o objeto no bucket e a URL pública
 * devolvida.
 *
 * `previousUrl`, se vier preenchido, é a capa que está sendo SUBSTITUÍDA —
 * apagada aqui, depois que a nova já passou em todas as checagens acima
 * (nunca antes: uma substituição que falhasse no meio não pode derrubar a
 * capa antiga que ainda está no ar). Só é removida se (a) for do nosso
 * bucket (extrairCaminhoCapa devolve null para uma URL colada de fora — essa
 * não é nossa para apagar) e (b) pertencer à MESMA pasta escopo/id que
 * acabou de ser verificada: sem essa checagem, quem chama esta função
 * poderia passar a URL pública de OUTRA área/curso como "previousUrl" e usar
 * a troca da própria capa para apagar um objeto que não gerencia. Falha ao
 * remover NUNCA derruba a confirmação — a capa nova já está de pé, que é o
 * que importa; só registra no log e segue, mesma disciplina de
 * "nunca lança" que sendEmail já usa (src/lib/email/send.ts). Isso deixa um
 * objeto órfão eventual no bucket público quando a remoção falha — aceito
 * deliberadamente, pelo mesmo motivo do próximo parágrafo.
 *
 * O que este rollback NÃO cobre — de propósito, não por descuido — é o
 * abandono: alguém escolhe um arquivo, o upload e a confirmação acontecem
 * (a imagem já está no bucket, pública), mas a pessoa fecha a aba ou muda
 * de campo antes de apertar Salvar. Não há "URL anterior" para substituir
 * nesse caso — é a PRIMEIRA capa, não uma troca — então nada aqui a
 * alcança, e ela fica no bucket sem nunca virar cover_url de nada. Resolver
 * isso exigiria uma varredura periódica (comparar objetos do bucket contra
 * os cover_url realmente gravados em areas/courses) — deliberadamente fora
 * do escopo desta função: um caminho de upload não é o lugar para lógica de
 * limpeza em lote, e o produto ainda não tem nenhuma rotina periódica desse
 * tipo. Se o volume de órfãos incomodar algum dia, a resposta é essa
 * varredura, não mais código aqui.
 */
export async function verifyCapaUpload(
  admin: AdminClient,
  escopo: CapaEscopo,
  id: string,
  path: string,
  previousUrl?: string | null,
): Promise<ActionResult<{ url: string }>> {
  const prefixo = `${escopo}/${id}/`
  if (!path.startsWith(prefixo)) return fail('Caminho de upload inválido.')

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

  if (previousUrl) {
    const caminhoAntigo = extrairCaminhoCapa(previousUrl)
    if (caminhoAntigo && caminhoAntigo.startsWith(prefixo) && caminhoAntigo !== path) {
      const { error: erroRemocao } = await admin.storage.from(CAPA_BUCKET).remove([caminhoAntigo])
      if (erroRemocao) {
        console.error('[verifyCapaUpload] falha ao remover capa substituída:', caminhoAntigo, erroRemocao)
      }
    }
  }

  return ok({ url: data.publicUrl })
}
