import Link from 'next/link'
import { ProgressBar } from '@/components/progress/progress-bar'
import { cn } from '@/lib/cn'

/**
 * O card de vidro "Continue de onde parou" (ou a trilha inicial). Um dos
 * quatro lugares onde a spec permite vidro (seção 4.2).
 */
export function DestaqueHome({
  rotulo,
  titulo,
  detalhe,
  capaUrl,
  concluidas,
  total,
  href,
  textoBotao,
}: {
  rotulo: string
  titulo: string
  detalhe: string
  capaUrl: string | null
  concluidas: number
  total: number
  href: string
  textoBotao: string
}) {
  return (
    <section
      aria-label={rotulo}
      className="flex flex-col gap-4 rounded-2xl border border-vidro-borda bg-vidro p-3 shadow-destaque backdrop-blur-md sm:flex-row sm:items-center sm:p-4"
    >
      <div
        className={cn(
          'aspect-[16/10] w-full shrink-0 overflow-hidden rounded-card sm:w-[44%]',
          capaUrl ? 'bg-capa-fundo' : 'bg-gradient-to-br from-azul to-ciano',
        )}
      >
        {capaUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={capaUrl} alt="" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="min-w-0 flex-1 px-1 pb-1">
        <p className="text-xs font-medium uppercase tracking-wider text-selecionado-texto">{rotulo}</p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-texto text-balance">{titulo}</h2>
        <p className="mt-0.5 text-sm text-texto-suave">{detalhe}</p>
        {total > 0 && (
          <div className="mt-3 max-w-md">
            <ProgressBar completed={concluidas} total={total} />
          </div>
        )}
        <Link
          href={href}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-acao px-5 py-2 text-sm font-semibold text-acao-texto transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-acao focus-visible:ring-offset-2 focus-visible:ring-offset-fundo"
        >
          <span aria-hidden>▶</span> {textoBotao}
        </Link>
      </div>
    </section>
  )
}
