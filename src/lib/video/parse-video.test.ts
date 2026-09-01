import { describe, expect, it } from 'vitest'
import { parseVideoInput, vturbContainerId, vturbScriptSrc, youtubeEmbedUrl } from './parse-video'

// Valores reais de um snippet da conta VTurb da GEX. O id da CONTA é um UUID;
// o id do PLAYER são 24 caracteres hex (não é UUID) e o caminho traz a versão.
const CONTA = 'e451b1fd-5061-402e-b7d3-3c5addf178dd'
const PLAYER = '694a5bad71611df8184abb68'
const REF = `${CONTA}/${PLAYER}/v4`

describe('parseVideoInput — YouTube', () => {
  it('lê a URL padrão de watch', () => {
    expect(parseVideoInput('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({
      provider: 'youtube',
      ref: 'dQw4w9WgXcQ',
    })
  })

  it('lê o link curto youtu.be', () => {
    expect(parseVideoInput('https://youtu.be/dQw4w9WgXcQ')).toEqual({
      provider: 'youtube',
      ref: 'dQw4w9WgXcQ',
    })
  })

  it('lê a URL de embed', () => {
    expect(parseVideoInput('https://www.youtube.com/embed/dQw4w9WgXcQ')).toEqual({
      provider: 'youtube',
      ref: 'dQw4w9WgXcQ',
    })
  })

  it('ignora parâmetros extras como lista e tempo', () => {
    const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123&t=42s'
    expect(parseVideoInput(url)?.ref).toBe('dQw4w9WgXcQ')
  })

  it('aceita a URL sem protocolo', () => {
    expect(parseVideoInput('youtube.com/watch?v=dQw4w9WgXcQ')?.ref).toBe('dQw4w9WgXcQ')
  })

  it('recusa id com tamanho diferente de 11', () => {
    expect(parseVideoInput('https://www.youtube.com/watch?v=curto')).toBeNull()
  })

  it('monta a URL de embed sem cookies e sem vídeos relacionados', () => {
    expect(youtubeEmbedUrl('dQw4w9WgXcQ')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1',
    )
  })
})

describe('parseVideoInput — VTurb', () => {
  // Snippet real, copiado da conta da GEX. Repare que ele traz um web component
  // <vturb-smartplayer>, o id do player NÃO é UUID, e o caminho tem versão.
  const SNIPPET_REAL = `<vturb-smartplayer id="vid-${PLAYER}" style="display: block; margin: 0 auto; width: 100%; max-width: 400px;"><div class="vturb-player-placeholder" style="position: relative; width: 100%; padding: 125% 0 0; z-index: 0; background-color: black;"></div></vturb-smartplayer> <script type="text/javascript"> var s=document.createElement("script"); s.src="https://scripts.converteai.net/${CONTA}/players/${PLAYER}/v4/player.js", s.async=!0,document.head.appendChild(s); </script>`

  it('extrai conta, player e versão do snippet real', () => {
    expect(parseVideoInput(SNIPPET_REAL)).toEqual({ provider: 'vturb', ref: REF })
  })

  it('extrai também do bloco com preloads que o VTurb costuma acompanhar', () => {
    const comPreloads = `${SNIPPET_REAL}\n<link rel="preload" href="https://scripts.converteai.net/${CONTA}/players/${PLAYER}/v4/player.js" as="script">\n<link rel="dns-prefetch" href="https://cdn.converteai.net">`
    expect(parseVideoInput(comPreloads)).toEqual({ provider: 'vturb', ref: REF })
  })

  it('extrai da URL do player colada sozinha', () => {
    const url = `https://scripts.converteai.net/${CONTA}/players/${PLAYER}/v4/player.js`
    expect(parseVideoInput(url)).toEqual({ provider: 'vturb', ref: REF })
  })

  it('aceita o trio conta/player/versão digitado à mão', () => {
    expect(parseVideoInput(REF)).toEqual({ provider: 'vturb', ref: REF })
  })

  it('assume v4 quando o caminho não traz versão', () => {
    const semVersao = `https://scripts.converteai.net/${CONTA}/players/${PLAYER}/v4/player.js`
    expect(parseVideoInput(semVersao)).toEqual({ provider: 'vturb', ref: REF })
  })

  it('não confunde o id do vídeo no CDN com o id do player', () => {
    // O snippet traz um terceiro id, do arquivo de mídia, que NÃO serve aqui.
    const soCdn = `<link rel="preload" href="https://cdn.converteai.net/${CONTA}/694a5b9d71611df8184abb66/main.m3u8" as="fetch">`
    expect(parseVideoInput(soCdn)).toBeNull()
  })

  it('recusa snippet só com o id da conta', () => {
    expect(parseVideoInput(`<script src="https://scripts.converteai.net/${CONTA}/x.js"></script>`)).toBeNull()
  })

  it('recusa id de player com tamanho errado', () => {
    const curto = `https://scripts.converteai.net/${CONTA}/players/abc123/v4/player.js`
    expect(parseVideoInput(curto)).toBeNull()
  })

  it('monta a URL do script a partir do ref', () => {
    expect(vturbScriptSrc(REF)).toBe(
      `https://scripts.converteai.net/${CONTA}/players/${PLAYER}/v4/player.js`,
    )
  })

  it('monta o id do container com hífen, como o snippet real', () => {
    expect(vturbContainerId(REF)).toBe(`vid-${PLAYER}`)
  })
})

describe('parseVideoInput — entradas inválidas', () => {
  it('recusa string vazia', () => {
    expect(parseVideoInput('')).toBeNull()
  })

  it('recusa só espaços', () => {
    expect(parseVideoInput('   ')).toBeNull()
  })

  it('recusa uma URL de outro provedor', () => {
    expect(parseVideoInput('https://vimeo.com/123456789')).toBeNull()
  })

  it('não devolve HTML executável em hipótese alguma', () => {
    const malicioso = `<script>alert(1)</script><img src=x onerror="alert(2)">`
    expect(parseVideoInput(malicioso)).toBeNull()
  })

  it('extrai apenas os identificadores mesmo com script malicioso junto', () => {
    const misto = `<script>alert(1)</script><script src="https://scripts.converteai.net/${CONTA}/players/${PLAYER}/player.js"></script>`
    const parsed = parseVideoInput(misto)
    expect(parsed).toEqual({ provider: 'vturb', ref: `${CONTA}/${PLAYER}` })
    expect(parsed!.ref).not.toContain('<')
    expect(parsed!.ref).not.toContain('alert')
  })
})
