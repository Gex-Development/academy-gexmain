'use client'

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import type { AbaDaAula } from '@/lib/aula/abas'

/**
 * Abas acessíveis da sala de aula (padrão WAI-ARIA de tabs, ativação
 * automática). Todo conteúdo vem renderizado do servidor; a aba só alterna
 * o que está visível — painéis inativos ficam `hidden`, não desmontados,
 * para o formulário do fórum não perder o que foi digitado ao trocar de aba.
 */
export function AbasDaAula({
  abas,
  inicial,
}: {
  abas: { id: AbaDaAula; rotulo: string; conteudo: ReactNode }[]
  inicial: AbaDaAula
}) {
  const [ativa, setAtiva] = useState<AbaDaAula>(inicial)
  const base = useId()
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  function aoTeclar(e: KeyboardEvent, i: number) {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    const destino = e.key === 'Home' ? 0 : e.key === 'End' ? abas.length - 1 : delta ? (i + delta + abas.length) % abas.length : -1
    if (destino === -1) return
    e.preventDefault()
    setAtiva(abas[destino]!.id)
    refs.current[destino]?.focus()
  }

  return (
    <div>
      <div role="tablist" aria-label="Conteúdo da aula" className="flex flex-wrap gap-2">
        {abas.map((aba, i) => {
          const selecionada = aba.id === ativa
          return (
            <button
              key={aba.id}
              ref={(el) => {
                refs.current[i] = el
              }}
              type="button"
              role="tab"
              id={`${base}-aba-${aba.id}`}
              aria-selected={selecionada}
              aria-controls={`${base}-painel-${aba.id}`}
              tabIndex={selecionada ? 0 : -1}
              onClick={() => setAtiva(aba.id)}
              onKeyDown={(e) => aoTeclar(e, i)}
              className={cn(
                'rounded-full border px-4 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-acao',
                selecionada
                  ? 'border-selecionado-borda bg-selecionado font-medium text-selecionado-texto'
                  : 'border-vidro-borda bg-vidro text-texto-suave hover:text-texto',
              )}
            >
              {aba.rotulo}
            </button>
          )
        })}
      </div>
      {abas.map((aba) => (
        <div
          key={aba.id}
          role="tabpanel"
          id={`${base}-painel-${aba.id}`}
          aria-labelledby={`${base}-aba-${aba.id}`}
          hidden={aba.id !== ativa}
          // tabIndex 0: padrão WAI-ARIA de tabs quando o painel pode não ter
          // nenhum elemento focável dentro (a aba "Sobre" é só texto) — sem
          // isso, quem navega por teclado não consegue Tab da tablist para
          // dentro do painel.
          tabIndex={0}
          className="rounded-lg pt-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-acao"
        >
          {aba.conteudo}
        </div>
      ))}
    </div>
  )
}
