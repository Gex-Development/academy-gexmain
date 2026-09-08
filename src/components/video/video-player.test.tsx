// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { VideoPlayer } from './video-player'

// Regressão real: o player do VTurb sumia da tela da aula.
//
// Causa: o script do VTurb roda UMA vez e inicializa só os elementos que
// existirem naquele instante. Com o script renderizado uma vez por página
// (<Script strategy="afterInteractive">), a segunda montagem do componente —
// que o modo estrito do React provoca em desenvolvimento — nascia órfã. O
// player não aparecia, com altura zero e nenhum erro visível.
//
// Medido em navegador de verdade antes da correção: montagem única, 720px;
// com remontagem, 0px; reinjetando o script, 720px.
//
// Estes testes não sobem o player (não há rede aqui) — guardam o MECANISMO
// que a correção depende: o script acompanha a montagem, não a página.
const REF = 'conta-abc/player-123/v4'

function scriptsDoVturb() {
  return Array.from(document.querySelectorAll('script[src*="converteai"]'))
}

afterEach(cleanup)

describe('VideoPlayer — VTurb', () => {
  it('cria o custom element com o id que o script do VTurb procura', () => {
    const { container } = render(<VideoPlayer provider="vturb" videoRef={REF} title="Aula" />)

    const player = container.querySelector('vturb-smartplayer')
    expect(player).not.toBeNull()
    expect(player!.id).toBe('vid-player-123')
  })

  it('injeta o script apontando para a conta e o player certos', () => {
    render(<VideoPlayer provider="vturb" videoRef={REF} title="Aula" />)

    const scripts = scriptsDoVturb()
    expect(scripts).toHaveLength(1)
    expect(scripts[0].getAttribute('src')).toBe(
      'https://scripts.converteai.net/conta-abc/players/player-123/v4/player.js',
    )
  })

  it('remove o script ao desmontar — senão eles se acumulam a cada troca de aula', () => {
    const { unmount } = render(<VideoPlayer provider="vturb" videoRef={REF} title="Aula" />)
    expect(scriptsDoVturb()).toHaveLength(1)

    unmount()
    expect(scriptsDoVturb()).toHaveLength(0)
  })

  // ESTE é o teste da regressão, e ele compara a IDENTIDADE do nó, não a
  // contagem. Contar não discriminaria: no comportamento antigo também havia
  // um script na página depois de remontar — o mesmo de antes, já executado,
  // que não inicializa o elemento novo. O que prova a correção é o script ser
  // um nó NOVO, inserido depois de o elemento existir.
  it('remontar insere um script NOVO — é o que o modo estrito faz em dev', () => {
    const primeira = render(<VideoPlayer provider="vturb" videoRef={REF} title="Aula" />)
    const scriptDaPrimeira = scriptsDoVturb()[0]
    primeira.unmount()

    render(<VideoPlayer provider="vturb" videoRef={REF} title="Aula" />)
    const scriptDaSegunda = scriptsDoVturb()[0]

    expect(scriptDaSegunda).toBeDefined()
    expect(scriptDaSegunda).not.toBe(scriptDaPrimeira)
    expect(document.querySelector('vturb-smartplayer')).not.toBeNull()
  })

  it('trocar de vídeo troca o elemento e o script, sem deixar o anterior para trás', () => {
    const { rerender, container } = render(
      <VideoPlayer provider="vturb" videoRef={REF} title="Aula" />,
    )

    rerender(<VideoPlayer provider="vturb" videoRef="conta-abc/player-999/v4" title="Outra" />)

    expect(container.querySelectorAll('vturb-smartplayer')).toHaveLength(1)
    expect(container.querySelector('vturb-smartplayer')!.id).toBe('vid-player-999')
    expect(scriptsDoVturb()).toHaveLength(1)
    expect(scriptsDoVturb()[0].getAttribute('src')).toContain('player-999')
  })
})

describe('VideoPlayer — YouTube', () => {
  it('usa iframe do domínio sem cookies e não injeta script nenhum', () => {
    const { container } = render(
      <VideoPlayer provider="youtube" videoRef="dQw4w9WgXcQ" title="Aula" />,
    )

    const iframe = container.querySelector('iframe')
    expect(iframe!.getAttribute('src')).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ')
    expect(scriptsDoVturb()).toHaveLength(0)
  })
})
