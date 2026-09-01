'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

// Error boundary da área de administração (pessoas, áreas, fila de
// solicitações de acesso) — mesmo raciocínio de src/app/(app)/error.tsx e
// src/app/(manage)/error.tsx. listAccessRequests (src/server/
// access-requests.ts) já dava `throw` numa falha de consulta antes da
// rodada 1 desta revisão — foi, inclusive, o precedente que o item 5 citou
// para listQuestions/listPendingQuestions/getDashboard — mas nunca teve
// boundary própria: a fila do admin caía direto na tela de erro genérica do
// Next. AppShell (nav) fica de fora: error.js não envolve o layout.tsx do
// mesmo segmento.
//
// `retry`, não `reset` — mesmo motivo documentado nas outras duas
// boundaries: só retry() refaz a busca no servidor; reset() sozinho não
// teria como resolver uma consulta que falhou.
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error('[admin/error]', error)
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
