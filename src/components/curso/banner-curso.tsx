import Link from 'next/link'
import { ProgressBar } from '@/components/progress/progress-bar'
import { cn } from '@/lib/cn'

export function BannerCurso({
  rotulo,
  titulo,
  descricao,
  capaUrl,
  concluidas,
  total,
  acao,
}: {
  rotulo: string
  titulo: string
  descricao: string | null
  capaUrl: string | null
  concluidas: number
  total: number
  acao: { href: string; texto: string } | null
}) {
  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-2xl border border-vidro-borda',
        capaUrl ? 'bg-capa-fundo' : 'bg-gradient-to-br from-azul to-ciano',
      )}
    >
      {capaUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={capaUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}
      {/* Escurece da esquerda (onde está o texto) para a direita, e de baixo
          para cima — o texto branco lê em cima de qualquer capa. */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/65 to-black/10" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
      <div className="relative flex min-h-72 max-w-2xl flex-col justify-end gap-2 p-6 sm:min-h-80 sm:p-8">
        <p className="text-xs font-medium uppercase tracking-wider text-white/75">{rotulo}</p>
        <h1 className="text-3xl font-semibold tracking-tight text-white text-balance sm:text-4xl">{titulo}</h1>
        {descricao && <p className="text-sm text-white/80 line-clamp-3">{descricao}</p>}
        {total > 0 && (
          <div className="mt-1 max-w-sm">
            <ProgressBar completed={concluidas} total={total} tom="sobre-imagem" />
          </div>
        )}
        {acao && (
          <Link
            href={acao.href}
            className="mt-3 inline-flex w-fit items-center gap-2 rounded-full bg-acao px-5 py-2.5 text-sm font-semibold text-acao-texto transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <span aria-hidden>▶</span> {acao.texto}
          </Link>
        )}
      </div>
    </section>
  )
}
