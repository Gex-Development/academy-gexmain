'use client'

import Script from 'next/script'
import { createElement } from 'react'
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

  // O VTurb não usa uma <div>: o player.js registra o custom element
  // <vturb-smartplayer> e procura o elemento com id "vid-<playerId>".
  // Usamos createElement em vez de JSX porque JSX exigiria declarar o elemento
  // em IntrinsicElements, e o caminho dessa declaração mudou entre versões do
  // React — createElement funciona em qualquer uma, sem tipagem ambiente.
  return (
    <div className="w-full overflow-hidden rounded-card bg-black">
      {createElement(
        'vturb-smartplayer',
        { id: vturbContainerId(videoRef), style: { display: 'block', width: '100%' } },
        // Reserva o espaço antes de o player carregar. 56.25% = 16:9, a
        // proporção usual de aula gravada; o player se reajusta ao carregar,
        // então um vídeo vertical não fica cortado, só reflui.
        <div style={{ position: 'relative', width: '100%', padding: '56.25% 0 0', backgroundColor: 'black' }} />,
      )}
      <Script src={vturbScriptSrc(videoRef)} strategy="afterInteractive" />
    </div>
  )
}
