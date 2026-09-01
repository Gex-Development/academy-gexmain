'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

// Error boundary da área de gestão (fila de dúvidas, painel de
// acompanhamento, cadastro de curso/aula) — mesmo raciocínio de
// src/app/(app)/error.tsx: sem esta boundary, um `throw` de getDashboard ou
// listPendingQuestions (item 5 da revisão de fase 3 — leitura que falha
// agora lança em vez de virar lista vazia) sobe até o boundary raiz do Next
// e troca a tela inteira pela tela de erro genérica em inglês. AppShell
// (nav) fica de fora: error.js não envolve o layout.tsx do mesmo segmento.
//
// `retry`, não `reset` — mesmo motivo documentado em (app)/error.tsx: só
// retry() refaz a busca no servidor; reset() sozinho não teria como
// resolver uma consulta que falhou.
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error('[manage/error]', error)
  }, [error])

  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <h1 className="text-lg font-semibold">Não foi possível carregar esta página</h1>
      <p className="max-w-sm text-sm text-texto-suave">
        Algo deu errado ao buscar os dados. Tente de novo — se continuar acontecendo, avise o
        time técnico.
      </p>
      <Button variant="secundario" onClick={() => retry()}>
        Tentar de novo
      </Button>
    </div>
  )
}
