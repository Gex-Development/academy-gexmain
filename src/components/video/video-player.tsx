'use client'

import { useEffect, useRef } from 'react'
import type { VideoProvider } from '@/lib/video'
import { vturbContainerId, vturbScriptSrc, youtubeEmbedUrl } from '@/lib/video'

/**
 * Renderiza o player a partir de identificadores validados.
 * Nada aqui vem de HTML colado por usuário: `videoRef` já passou por
 * parseVideoInput e contém apenas ids.
 */
export function VideoPlayer({
  provider,
  videoRef,
  title,
}: {
  provider: VideoProvider
  videoRef: string
  title: string
}) {
  if (provider === 'youtube') {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-card bg-black">
        <iframe
          src={youtubeEmbedUrl(videoRef)}
          title={title}
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="h-full w-full border-0"
        />
      </div>
    )
  }

  return <VturbPlayer videoRef={videoRef} />
}

/**
 * O VTurb, e por que ele é montado à mão em vez de por JSX.
 *
 * O player.js registra o custom element <vturb-smartplayer> e, ao executar,
 * procura o elemento com id "vid-<playerId>" que existir NAQUELE momento.
 * Ele roda uma vez e não varre o documento de novo.
 *
 * A versão anterior renderizava o elemento em JSX e o script com <Script
 * strategy="afterInteractive">, que carrega UMA vez por página. Isso quebrava
 * na remontagem: o React em modo estrito monta, desmonta e monta outra vez em
 * desenvolvimento, e o elemento da segunda montagem nascia órfão — o script
 * já tinha rodado. O player sumia, deixando um espaço de altura zero, sem
 * erro visível para quem estava olhando.
 *
 * Medido, não deduzido: montagem única deu 720px de altura; com remontagem,
 * 0px. Reinjetando o script a cada montagem, 720px de novo.
 *
 * Por isso, aqui:
 *  - o elemento é criado com createElement do DOM, não por JSX: o player
 *    substitui o conteúdo interno dele, e o React não pode reconciliar o que
 *    não controla;
 *  - o script é injetado no efeito, DEPOIS de o elemento existir, e removido
 *    na limpeza — cada montagem ganha uma execução nova.
 */
function VturbPlayer({ videoRef }: { videoRef: string }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Montado por API do DOM, nunca por innerHTML: `videoRef` já vem
    // validado, mas construir HTML por interpolação de texto é o hábito que
    // vira injeção no dia em que a validação afrouxar.
    const player = document.createElement('vturb-smartplayer')
    player.id = vturbContainerId(videoRef)
    player.style.display = 'block'
    player.style.width = '100%'

    // Reserva o espaço antes de o player carregar. 56.25% = 16:9, a
    // proporção usual de aula gravada; o player se reajusta ao carregar,
    // então um vídeo vertical não fica cortado, só reflui.
    const reserva = document.createElement('div')
    reserva.style.position = 'relative'
    reserva.style.width = '100%'
    reserva.style.padding = '56.25% 0 0'
    reserva.style.backgroundColor = 'black'
    player.appendChild(reserva)
    container.appendChild(player)

    const script = document.createElement('script')
    script.src = vturbScriptSrc(videoRef)
    script.async = true
    document.body.appendChild(script)

    return () => {
      script.remove()
      container.replaceChildren()
    }
  }, [videoRef])

  return <div ref={containerRef} className="w-full overflow-hidden rounded-card bg-black" />
}
