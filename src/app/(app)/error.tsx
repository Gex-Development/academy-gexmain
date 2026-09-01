'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

// Error boundary da área logada (AppShell fica de fora: error.js não envolve
// o layout.tsx do mesmo segmento, só page.js/layout.js aninhados — ver
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md).
// Sem este arquivo, um `throw` em qualquer leitura de página (por exemplo
// listQuestions, em /curso/[slug]/aula/[lessonSlug]) sobe até o boundary
// raiz do Next e troca a tela inteira — player, botão de concluir,
// materiais e navegação entre aulas incluídos — por uma tela genérica em
// inglês. Esta boundary limita o estrago à área de conteúdo da página.
//
// `retry`, não `reset`: nesta versão do Next (16.3.4, retry estabilizado na
// 16.3.0) reset() só limpa o estado local do boundary e re-renderiza os
// MESMOS filhos, sem buscar dados de novo — inútil para o caso de verdade
// aqui, que é uma consulta ao banco que falhou. retry() primeiro atualiza a
// rota (refaz a busca no servidor) e só depois limpa o erro; é o único dos
// dois que pode de fato resolver o problema.
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error('[app/error]', error)
  }, [error])

  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <h1 className="text-lg font-semibold">Não foi possível carregar esta página</h1>
      <p className="max-w-sm text-sm text-texto-suave">
        Algo deu errado ao buscar os dados. Tente de novo — se continuar acontecendo, avise o
        administrador.
      </p>
      <Button variant="secundario" onClick={() => retry()}>
        Tentar de novo
      </Button>
    </div>
  )
}
