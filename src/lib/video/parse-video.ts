import type { ParsedVideo } from './types'

const YOUTUBE_ID = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/

// Formatos confirmados contra um snippet real da conta VTurb da GEX:
//   conta   -> UUID
//   player  -> 24 caracteres hex, NÃO é UUID
//   versão  -> "v4" no caminho (opcional; ausente em snippets mais antigos)
// O host `scripts.converteai.net` é o do player. O `cdn.converteai.net` do mesmo
// snippet carrega o arquivo de mídia com um TERCEIRO id — que não serve aqui, e
// por isso o padrão exige o segmento `/players/`.
const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
const PLAYER_ID = '[0-9a-fA-F]{24}'
const VTURB_URL = new RegExp(
  `scripts\\.converteai\\.net/(${UUID})/players/(${PLAYER_ID})(?:/(v\\d+))?/player\\.js`,
)
const VTURB_TRIO = new RegExp(`^(${UUID})/(${PLAYER_ID})(?:/(v\\d+))?$`)

/**
 * Identifica o provedor de vídeo a partir do que o líder colou no editor.
 *
 * Aceita URL do YouTube em qualquer formato, e do VTurb aceita o snippet de
 * incorporação inteiro, a URL do player ou o par "conta/player".
 *
 * SEGURANÇA: o retorno contém apenas identificadores extraídos por expressão
 * regular. Nenhum trecho do que o usuário colou é preservado para renderização,
 * então não existe caminho para injetar HTML ou script pela caixa de vídeo.
 */
export function parseVideoInput(input: string): ParsedVideo | null {
  const texto = input.trim()
  if (!texto) return null

  const youtube = texto.match(YOUTUBE_ID)
  if (youtube) return { provider: 'youtube', ref: youtube[1] }

  const vturb = texto.match(VTURB_URL) ?? texto.match(VTURB_TRIO)
  if (vturb) {
    const versao = vturb[3]
    const ref = versao ? `${vturb[1]}/${vturb[2]}/${versao}` : `${vturb[1]}/${vturb[2]}`
    return { provider: 'vturb', ref }
  }

  return null
}

export function youtubeEmbedUrl(ref: string): string {
  return `https://www.youtube-nocookie.com/embed/${ref}?rel=0&modestbranding=1`
}

export function vturbScriptSrc(ref: string): string {
  const [conta, player, versao] = ref.split('/')
  return `https://scripts.converteai.net/${conta}/players/${player}/${versao}/player.js`
}

/** O snippet real usa hífen, não sublinhado: `id="vid-<playerId>"`. */
export function vturbContainerId(ref: string): string {
  return `vid-${ref.split('/')[1]}`
}
