import Link from 'next/link'
import { cn } from '@/lib/cn'
import type { FiltroProgresso } from '@/server/vitrine-query'

const OPCOES: { valor: FiltroProgresso; rotulo: string }[] = [
  { valor: 'tudo', rotulo: 'Tudo' },
  { valor: 'continuar', rotulo: 'Continuar' },
  { valor: 'nao-iniciados', rotulo: 'Não iniciados' },
  { valor: 'concluidos', rotulo: 'Concluídos' },
]

/**
 * Links, não botões: o filtro vive na URL (spec, seção 9.2). Funciona sem
 * JavaScript, dá para mandar o link, e o voltar do navegador desfaz.
 */
export function FiltrosProgresso({ ativo }: { ativo: FiltroProgresso }) {
  return (
    <nav aria-label="Filtrar cursos" className="flex flex-wrap gap-2">
      {OPCOES.map(({ valor, rotulo }) => {
        const selecionado = valor === ativo
        return (
          <Link
            key={valor}
            href={valor === 'tudo' ? '/' : `/?filtro=${valor}`}
            aria-current={selecionado ? 'page' : undefined}
            className={cn(
              'rounded-full border px-4 py-1.5 text-sm transition-colors',
              selecionado
                ? 'border-selecionado-borda bg-selecionado font-medium text-selecionado-texto'
                : 'border-vidro-borda bg-vidro text-texto-suave hover:text-texto',
            )}
          >
            {rotulo}
          </Link>
        )
      })}
    </nav>
  )
}
