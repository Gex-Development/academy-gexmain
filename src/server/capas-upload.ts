// Sem 'use server': as funções abaixo conversam de verdade com o Storage
// (mint da URL assinada, verificação do upload direto do navegador, limpeza
// de capa substituída), mas não dependem de cookies() — mesmo raciocínio de
// attachments-upload.ts (que por sua vez segue courses-query.ts): o que não
// precisa de cookies() sai para um módulo à parte, para um teste de banco
// poder chamar a MESMA função que a action usa, contra o Storage de
// verdade, sem precisar simular um request Next.js. É por isso, também, que
// a checagem de prefixo de caminho (em verifyCapaUpload) mora AQUI, e não
// em capas.ts: capas.ts é 'use server' e exige cookies() para rodar
// (getCurrentUser), então nenhum teste de banco alcança o que estiver lá
// dentro — e essa checagem é exatamente o tipo de regra que precisa de
// teste direto, não só de leitura de código.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import {
  CAPA_BUCKET,
  buildCapaPath,
  caminhoDaCapa,
  validateCapa,
  type CapaEscopo,
} from '@/lib/storage/capas'
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
 * mintar — e devolve a URL pública. Sem este passo, tirar o upload do
 * servidor teria tirado a validação junto: bastaria declarar "300 KB, PNG"
 * e mandar 200 MB de outra coisa.
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
 * Em caso de falha na validação do que chegou, remove o objeto NOVO do
 * bucket — mesma lógica de rollback que verifyAndRegisterAttachment já usa
 * para anexos. Capa não tem linha própria no banco (é só uma URL guardada
 * em areas.cover_url ou courses.cover_url, gravada pela action de salvar
 * área/curso, não por esta função) — por isso não há o caso de "confirmação
 * repetida" que attachments-upload.ts trata via storage_path único: aqui
 * não existe registro para colidir, só o objeto no bucket e a URL pública
 * devolvida.
 *
 * O que esta função NUNCA faz é mexer numa capa ANTERIOR/substituída — nem
 * mesmo quando `path` é claramente uma troca. Uma versão anterior desta
 * função tentava: recebia a URL antiga e apagava o objeto correspondente
 * aqui mesmo, na confirmação. Isso quebrava um caminho real: confirmar um
 * upload NÃO é o mesmo que salvar uma capa — confirmCapaUpload só devolve a
 * URL pública, e quem grava `cover_url` é updateArea/updateCourse, no
 * Salvar, um passo depois, que pode nunca acontecer (alguém confirma o
 * upload e fecha a aba sem salvar). Apagar a capa antiga NESTE ponto
 * deixava o banco apontando para um objeto que já não existia mais sempre
 * que isso acontecesse — capa quebrada, pública, visível para a empresa
 * inteira, sem conserto. A limpeza da capa substituída mora em
 * apagarCapaSubstituida, abaixo, chamada só depois que a escrita no banco
 * já teve sucesso — nunca no passo de confirmar o upload.
 */
export async function verifyCapaUpload(
  admin: AdminClient,
  escopo: CapaEscopo,
  id: string,
  path: string,
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
  return ok({ url: data.publicUrl })
}

/**
 * Caminho de um objeto do bucket 'capas' a partir da URL pública, ou null se
 * a URL não é nossa (ex.: colada de fora — essa não é nossa para apagar).
 *
 * A regra em si mora em lib/storage/capas.ts, junto com a faxina de órfãs,
 * que precisa exatamente da mesma resposta. Aqui só se acrescenta a base do
 * ambiente. Duas cópias desta regra a dois arquivos de distância seria a
 * receita para uma divergir da outra — e esta decide o que pode ser APAGADO.
 */
function extrairCaminhoCapa(url: string): string | null {
  return caminhoDaCapa(url, process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
}

/**
 * Apaga a capa ANTERIOR de uma entidade — chamada por updateArea/
 * updateCourse, DEPOIS que a gravação da capa NOVA no banco já teve
 * sucesso. Nunca chamada pelo passo de confirmar upload (verifyCapaUpload,
 * acima) — ver o porquê no comentário longo lá: um upload confirmado não é
 * o mesmo que uma capa salva, e apagar cedo demais deixava o banco
 * apontando para um objeto que já não existia.
 *
 * PROVA DE GRAVAÇÃO (rodada de correção 3): o parâmetro que era `urlNova:
 * string` virou `linhaGravada: { cover_url: string | null }` — a capa NOVA
 * é lida DELA, nunca de um valor que quem chama poderia ter calculado ANTES
 * de gravar qualquer coisa (ex.: o texto que veio do formulário). A ideia é
 * que quem chama só consegue produzir honestamente esse objeto depois de um
 * INSERT/UPDATE de verdade ter voltado do Postgres (`.select('cover_url')`
 * no retorno da gravação) — updateArea e updateCourse passam exatamente
 * isso, não um valor solto.
 *
 * O efeito prático: isto transforma a ORDEM (gravar antes de apagar) de uma
 * convenção que dependia de quem chama lembrar dela — o que já falhou uma
 * vez, na rodada 1 — numa invariante que esta função cobra sozinha. Se
 * algum dia alguém chamar esta função ANTES da gravação de verdade,
 * generalizando o bug da rodada 1, a única `linhaGravada` disponível nesse
 * momento ainda mostra a capa ANTIGA (porque a gravação não aconteceu) — e
 * `linhaGravada.cover_url` sai igual a `urlAntiga`. Isso cai na MESMA
 * checagem de "não mudou" logo abaixo, que já recusa apagar. Não tem como
 * chamar esta função cedo demais e ainda assim apagar algo — testado em
 * tests/db/capas.test.ts ("recusa apagar quando a linha gravada ainda
 * mostra a capa antiga").
 *
 * Com a exclusão só acontecendo aqui, o pior cenário de abandono muda de
 * figura conforme o caso:
 * - Primeira capa de uma entidade (não havia nada antes): confirmar o
 *   upload e nunca salvar deixa um objeto órfão no bucket — sempre foi
 *   assim, aceito desde o desenho original (não há tabela própria para
 *   rastrear capas, então não tem como o sistema saber que aquele upload
 *   nunca virou cover_url de nada).
 * - Substituição (já havia uma capa): confirmar o upload da nova e nunca
 *   salvar agora TAMBÉM só deixa um objeto órfão — a nova, nunca
 *   referenciada. A antiga continua no ar, porque esta função só roda
 *   depois do Salvar ter sucesso, e o Salvar nunca aconteceu.
 * Nos dois casos o pior resultado é um arquivo a mais no bucket, que
 * ninguém vê. Nunca mais uma capa quebrada, que todo mundo vê. Se o volume
 * de órfãos incomodar algum dia, a resposta é uma varredura periódica
 * (comparar objetos do bucket contra os cover_url realmente gravados em
 * areas/courses) — deliberadamente fora do escopo desta função.
 *
 * Só remove quando: (a) havia uma capa antiga (`urlAntiga` não vazio), (b)
 * a capa que a linha GRAVADA de fato mostra é diferente da antiga — prova
 * de que a gravação realmente mudou o valor, não só a intenção de quem
 * chamou —, (c) a antiga é do NOSSO bucket (extrairCaminhoCapa devolve null
 * para uma URL colada de fora) e (d) pertence à MESMA pasta escopo/id da
 * entidade que acabou de ser salva — sem essa última checagem, um
 * `cover_url` antigo de OUTRA entidade poderia apagar um objeto que esta
 * chamada não tem relação nenhuma com.
 *
 * updateArea/updateCourse só chamam esta função quando JÁ acham (pela
 * própria comparação, antes de gravar) que a capa mudou — por isso, quando
 * (b) falha aqui dentro (a linha gravada não confirma a mudança), não é o
 * caminho comum de um Salvar que não mexeu na capa (esse nem chega a
 * chamar esta função): é ou uma corrida (ver o comentário seguinte) ou o
 * próprio bug que esta prova existe para prevenir — por isso vale log.
 *
 * CORRIDA ACEITA, NÃO TRATADA: dois salvamentos simultâneos na MESMA
 * entidade podem, em teoria, quebrar uma capa por um caminho diferente
 * deste — (1) salvamento X lê o cover_url ANTIGO A; (2) salvamento Y lê o
 * MESMO A; (3) X grava a capa B e, depois, chama esta função com
 * urlAntiga=A, que apaga o objeto A; (4) Y, que também tinha decidido
 * gravar A de volta (ou qualquer valor que reafirme A), grava A por cima de
 * B — e agora o banco aponta para A, que X acabou de apagar. Capa quebrada,
 * de novo, por um caminho que a prova de gravação acima NÃO fecha (cada
 * chamada, isolada, tem uma prova válida — o problema é a intercalação das
 * duas).
 *
 * Ruling: aceito, não guardado. Exige DOIS salvamentos concorrentes na
 * MESMA área ou curso, com coincidência de valores, num sistema com hoje
 * quatro áreas, onde só admin edita área e só o líder da área edita o curso
 * dela — a colisão exige duas pessoas (ou a mesma pessoa em duas abas)
 * editando a MESMA capa ao mesmo tempo, nesta escala pequena. A guarda
 * seria concorrência otimista no cover_url (um UPDATE ... WHERE cover_url =
 * $antigo, comparar-e-trocar), que faria salvamentos legítimos e
 * sequenciais falharem com um erro confuso ("outra pessoa mudou a capa
 * enquanto você editava") para prevenir algo que praticamente não ocorre
 * nesta escala. Custo se esta decisão estiver errada: uma capa quebrada,
 * que se conserta subindo de novo — não é silenciosa nem permanente. Se um
 * dia isto incomodar de verdade, a saída é concorrência otimista, não mais
 * código de limpeza aqui.
 *
 * Nunca lança: falha ao remover só registra no log e segue — a escrita no
 * banco já aconteceu e é o que importa; mesma disciplina de "nunca lança"
 * que sendEmail já usa (src/lib/email/send.ts). O resultado de uma falha
 * aqui é o MESMO órfão aceito acima — só que da capa antiga, não da nova.
 */
export async function apagarCapaSubstituida(
  admin: AdminClient,
  escopo: CapaEscopo,
  id: string,
  urlAntiga: string | null,
  linhaGravada: { cover_url: string | null },
): Promise<void> {
  if (!urlAntiga) return

  const urlNova = linhaGravada.cover_url
  if (urlAntiga === urlNova) {
    console.warn(
      '[apagarCapaSubstituida] a linha gravada ainda mostra a capa antiga — recusando apagar',
      { escopo, id },
    )
    return
  }

  const caminhoAntigo = extrairCaminhoCapa(urlAntiga)
  if (!caminhoAntigo || !caminhoAntigo.startsWith(`${escopo}/${id}/`)) return

  const { error } = await admin.storage.from(CAPA_BUCKET).remove([caminhoAntigo])
  if (error) {
    console.error('[apagarCapaSubstituida] falha ao remover capa substituída:', caminhoAntigo, error)
  }
}
