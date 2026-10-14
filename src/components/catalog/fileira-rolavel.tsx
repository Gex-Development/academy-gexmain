'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'

const INTERVALO_AUTOMATICO_MS = 5000
const ESPERA_APOS_INTERACAO_MS = 8000

/**
 * Cabeçalho + lista horizontal das fileiras da home, com setas ‹ › no lugar
 * da barra de rolagem. A barra fica escondida, mas a rolagem continua: dedo
 * no celular, trackpad e Tab (o foco num card rola até ele).
 *
 * As setas moram no cabeçalho, não sobre os cards: botão de vidro nunca vai
 * por cima de capa (pele "Vidro GEX", CLAUDE.md). Só aparecem quando a
 * fileira de fato transborda, e cada uma desliga ao chegar na ponta dela.
 * No celular ficam escondidas — lá deslizar o dedo é o gesto natural.
 *
 * Quando transborda, a fileira também anda sozinha, um card por vez, e volta
 * ao começo ao chegar no fim. Para enquanto o mouse ou o foco estão nela, por
 * alguns segundos depois de qualquer toque/rolagem manual, com a aba oculta e
 * com movimento reduzido no sistema. O botão de pausa (WCAG 2.2.2) para de vez.
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
  const [pausada, setPausada] = useState(false)
  const movimentoReduzido = useSyncExternalStore(assinarMovimentoReduzido, lerMovimentoReduzido, () => false)
  // Refs, não state: mudam a cada hover/rolagem e não precisam re-renderizar.
  const emUsoRef = useRef(false)
  const ultimaInteracaoRef = useRef(0)

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

  const transborda = podeVoltar || podeAvancar
  const automatica = transborda && !pausada && !movimentoReduzido

  useEffect(() => {
    if (!automatica) return
    // Folga aleatória: fileiras empilhadas não andam todas no mesmo instante.
    const intervalo = INTERVALO_AUTOMATICO_MS + Math.floor(Math.random() * 1500)
    const id = window.setInterval(() => {
      const lista = listaRef.current
      if (!lista || emUsoRef.current || document.hidden) return
      if (Date.now() - ultimaInteracaoRef.current < ESPERA_APOS_INTERACAO_MS) return
      const noFim = lista.scrollLeft + lista.clientWidth >= lista.scrollWidth - 1
      if (noFim) lista.scrollTo({ left: 0, behavior: 'smooth' })
      else lista.scrollBy({ left: passoDeUmCard(lista), behavior: 'smooth' })
    }, intervalo)
    return () => window.clearInterval(id)
  }, [automatica])

  function marcarInteracao() {
    ultimaInteracaoRef.current = Date.now()
  }

  function rolar(sentido: 1 | -1) {
    const lista = listaRef.current
    if (!lista) return
    marcarInteracao()
    const semAnimacao = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    // Quase uma tela de cards por clique; o snap-start encaixa no card seguinte.
    lista.scrollBy({ left: sentido * lista.clientWidth * 0.9, behavior: semAnimacao ? 'auto' : 'smooth' })
  }

  const idDaLista = `${tituloId}-lista`

  return (
    <section
      aria-labelledby={tituloId}
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse') emUsoRef.current = true
      }}
      onPointerLeave={() => {
        emUsoRef.current = false
      }}
      onFocus={() => {
        emUsoRef.current = true
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) emUsoRef.current = false
      }}
      onTouchStart={marcarInteracao}
      onWheel={marcarInteracao}
      onPointerMove={moverBrilho}
    >
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 id={tituloId} className="text-lg font-semibold tracking-tight text-texto">
          {titulo}
        </h2>
        <div className="flex shrink-0 items-center gap-3">
          {extra}
          {transborda && (
            <div className="hidden items-center gap-2 sm:flex">
              {!movimentoReduzido && (
                <BotaoDaFileira
                  rotulo={pausada ? `Retomar rolagem automática de ${titulo}` : `Pausar rolagem automática de ${titulo}`}
                  controla={idDaLista}
                  pressionado={pausada}
                  onClick={() => setPausada((p) => !p)}
                >
                  {pausada ? <IconeTocar /> : <IconePausar />}
                </BotaoDaFileira>
              )}
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
        className="entrada-escalonada -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 scroll-px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </ul>
    </section>
  )
}

const CONSULTA_MOVIMENTO_REDUZIDO = '(prefers-reduced-motion: reduce)'

function assinarMovimentoReduzido(avisar: () => void) {
  const consulta = window.matchMedia?.(CONSULTA_MOVIMENTO_REDUZIDO)
  consulta?.addEventListener('change', avisar)
  return () => consulta?.removeEventListener('change', avisar)
}

function lerMovimentoReduzido() {
  return window.matchMedia?.(CONSULTA_MOVIMENTO_REDUZIDO).matches ?? false
}

/** Leva o centro do brilho da borda ([data-brilho], globals.css) até o cursor. */
function moverBrilho(e: React.PointerEvent) {
  if (e.pointerType !== 'mouse') return
  const alvo = (e.target as Element).closest<HTMLElement>('[data-brilho]')
  if (!alvo) return
  const caixa = alvo.getBoundingClientRect()
  alvo.style.setProperty('--brilho-x', `${e.clientX - caixa.left}px`)
  alvo.style.setProperty('--brilho-y', `${e.clientY - caixa.top}px`)
}

/** Distância entre o início de um card e o do seguinte (largura + gap). */
function passoDeUmCard(lista: HTMLElement) {
  const [primeiro, segundo] = lista.children as unknown as HTMLElement[]
  const passo = primeiro && segundo ? segundo.offsetLeft - primeiro.offsetLeft : 0
  return passo > 0 ? passo : lista.clientWidth * 0.9
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
    <BotaoDaFileira rotulo={rotulo} controla={controla} desligada={desligada} onClick={onClick}>
      <span aria-hidden className="text-lg leading-none">
        {sentido === 'voltar' ? '‹' : '›'}
      </span>
    </BotaoDaFileira>
  )
}

function BotaoDaFileira({
  rotulo,
  controla,
  desligada,
  pressionado,
  onClick,
  children,
}: {
  rotulo: string
  controla: string
  desligada?: boolean
  pressionado?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      title={rotulo}
      aria-controls={controla}
      aria-pressed={pressionado}
      disabled={desligada}
      onClick={onClick}
      className="inline-grid h-9 w-9 place-items-center rounded-full border border-vidro-borda bg-vidro text-texto-suave backdrop-blur-md transition-[color,border-color,transform] active:scale-95 hover:border-selecionado-borda hover:text-texto focus:outline-none focus-visible:ring-2 focus-visible:ring-acao disabled:cursor-default disabled:opacity-40 disabled:hover:border-vidro-borda disabled:hover:text-texto-suave"
    >
      {children}
    </button>
  )
}

function IconePausar() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
      <rect x="3.5" y="2.5" width="3" height="11" rx="1" />
      <rect x="9.5" y="2.5" width="3" height="11" rx="1" />
    </svg>
  )
}

function IconeTocar() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="ml-0.5 h-3.5 w-3.5" fill="currentColor">
      <path d="M4.5 2.8v10.4a.8.8 0 0 0 1.2.7l8.2-5.2a.8.8 0 0 0 0-1.4L5.7 2.1a.8.8 0 0 0-1.2.7Z" />
    </svg>
  )
}
