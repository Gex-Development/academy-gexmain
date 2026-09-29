'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Cabeçalho + lista horizontal das fileiras da home, com setas ‹ › no lugar
 * da barra de rolagem. A barra fica escondida, mas a rolagem continua: dedo
 * no celular, trackpad e Tab (o foco num card rola até ele).
 *
 * As setas moram no cabeçalho, não sobre os cards: botão de vidro nunca vai
 * por cima de capa (pele "Vidro GEX", CLAUDE.md). Só aparecem quando a
 * fileira de fato transborda, e cada uma desliga ao chegar na ponta dela.
 * No celular ficam escondidas — lá deslizar o dedo é o gesto natural.
 */
export function FileiraRolavel({
  tituloId,
  titulo,
  extra,
  children,
}: {
  tituloId: string
  titulo: string
  /** Fica ao lado das setas, à direita do título (ex.: "Ver tudo →"). */
  extra?: ReactNode
  children: ReactNode
}) {
  const listaRef = useRef<HTMLUListElement>(null)
  const [podeVoltar, setPodeVoltar] = useState(false)
  const [podeAvancar, setPodeAvancar] = useState(false)

  const medir = useCallback(() => {
    const lista = listaRef.current
    if (!lista) return
    // Folga de 1px: o scrollLeft vem fracionado em tela com zoom.
    setPodeVoltar(lista.scrollLeft > 1)
    setPodeAvancar(lista.scrollLeft + lista.clientWidth < lista.scrollWidth - 1)
  }, [])

  useEffect(() => {
    const lista = listaRef.current
    if (!lista) return
    medir()
    lista.addEventListener('scroll', medir, { passive: true })
    window.addEventListener('resize', medir)
    const observador = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(medir)
    observador?.observe(lista)
    return () => {
      lista.removeEventListener('scroll', medir)
      window.removeEventListener('resize', medir)
      observador?.disconnect()
    }
  }, [medir])

  function rolar(sentido: 1 | -1) {
    const lista = listaRef.current
    if (!lista) return
    const semAnimacao = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    // Quase uma tela de cards por clique; o snap-start encaixa no card seguinte.
    lista.scrollBy({ left: sentido * lista.clientWidth * 0.9, behavior: semAnimacao ? 'auto' : 'smooth' })
  }

  const transborda = podeVoltar || podeAvancar
  const idDaLista = `${tituloId}-lista`

  return (
    <section aria-labelledby={tituloId}>
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 id={tituloId} className="text-lg font-semibold tracking-tight text-texto">
          {titulo}
        </h2>
        <div className="flex shrink-0 items-center gap-3">
          {extra}
          {transborda && (
            <div className="hidden items-center gap-2 sm:flex">
              <SetaDaFileira
                sentido="voltar"
                rotulo={`Rolar ${titulo} para a esquerda`}
                controla={idDaLista}
                desligada={!podeVoltar}
                onClick={() => rolar(-1)}
              />
              <SetaDaFileira
                sentido="avancar"
                rotulo={`Rolar ${titulo} para a direita`}
                controla={idDaLista}
                desligada={!podeAvancar}
                onClick={() => rolar(1)}
              />
            </div>
          )}
        </div>
      </div>
      {/* -mx/px: a rolagem vai até a borda da tela no celular, sem a página
          ganhar rolagem horizontal. scroll-px-4: scroll-snap ignora o
          padding do <ul>, então sem isso o 1º card encaixa 16px à esquerda
          do título. A barra de rolagem some nos dois motores (Firefox:
          scrollbar-width; Chrome/Safari: o pseudo-elemento). */}
      <ul
        ref={listaRef}
        id={idDaLista}
        className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 scroll-px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </ul>
    </section>
  )
}

function SetaDaFileira({
  sentido,
  rotulo,
  controla,
  desligada,
  onClick,
}: {
  sentido: 'voltar' | 'avancar'
  rotulo: string
  controla: string
  desligada: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      title={rotulo}
      aria-controls={controla}
      disabled={desligada}
      onClick={onClick}
      className="inline-grid h-9 w-9 place-items-center rounded-full border border-vidro-borda bg-vidro text-texto-suave backdrop-blur-md transition-colors hover:border-selecionado-borda hover:text-texto focus:outline-none focus-visible:ring-2 focus-visible:ring-acao disabled:cursor-default disabled:opacity-40 disabled:hover:border-vidro-borda disabled:hover:text-texto-suave"
    >
      <span aria-hidden className="text-lg leading-none">
        {sentido === 'voltar' ? '‹' : '›'}
      </span>
    </button>
  )
}
