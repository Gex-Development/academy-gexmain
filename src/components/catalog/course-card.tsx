import Link from 'next/link'
import { cn } from '@/lib/cn'
import type { CatalogItem } from '@/server/catalog'
import { capaComReserva } from '@/server/vitrine-query'

/**
 * Card de curso compartilhado pelas fileiras da home e pela grade da área
 * (spec 2026-09-29, seção 8.1). Sem vidro de propósito: a capa já é imagem,
 * e vidro sobre imagem é o "vidro em tudo" que a spec proíbe.
 */
export function CourseCard({ item, className }: { item: CatalogItem; className?: string }) {
  const bloqueado = item.access === 'none'
  const capa = capaComReserva(item)
  const comecou = !bloqueado && item.progress.completed > 0
  const percent = item.progress.percent

  return (
    <li className={className}>
      <Link
        href={`/curso/${item.slug}`}
        className="group block rounded-card focus:outline-none focus-visible:ring-2 focus-visible:ring-acao"
      >
        {/* Reserva final de capa (from-azul to-ciano): tokens fixos, iguais
            nos dois temas — sobre eles só vai o cadeado, nunca texto. */}
        <div
          className={cn(
            'relative aspect-[16/10] overflow-hidden rounded-card border border-vidro-borda',
            capa ? 'bg-capa-fundo' : 'bg-gradient-to-br from-azul to-ciano',
          )}
        >
          {capa && (
            // Capa é URL externa; next/image exigiria allowlist de domínio.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={capa}
              alt=""
              className={cn(
                'h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none',
                bloqueado && 'opacity-45 grayscale',
              )}
            />
          )}
          {bloqueado && (
            <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
              <span aria-hidden>🔒</span>
              <span className="sr-only">Curso bloqueado</span>
            </span>
          )}
          {comecou && (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
              <div className="h-full bg-gradient-to-r from-azul to-ciano" style={{ width: `${percent}%` }} />
            </div>
          )}
        </div>
        <h3 className="mt-2 line-clamp-2 text-sm font-semibold text-texto">{item.title}</h3>
        <p className="mt-0.5 text-xs text-texto-suave">
          {item.lessonCount} {item.lessonCount === 1 ? 'aula' : 'aulas'}
          {comecou && ` · ${percent}%`}
          {bloqueado && item.requestStatus === 'pending' && ' · acesso solicitado'}
        </p>
      </Link>
    </li>
  )
}
