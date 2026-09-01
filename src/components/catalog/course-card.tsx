import Link from 'next/link'
import { ProgressBar } from '@/components/progress/progress-bar'
import type { CatalogItem } from '@/server/catalog'

export function CourseCard({ item }: { item: CatalogItem }) {
  const bloqueado = item.access === 'none'

  const capa = (
    <div
      className="relative aspect-video w-full overflow-hidden rounded-card border border-borda bg-capa-fundo"
      style={item.areaColor && !item.coverUrl ? { backgroundColor: item.areaColor } : undefined}
    >
      {item.coverUrl && (
        // Capa é URL externa informada pelo líder; next/image exigiria allowlist de domínio.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.coverUrl} alt="" className="h-full w-full object-cover" />
      )}
      {bloqueado && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/45">
          <span aria-hidden className="text-2xl">
            🔒
          </span>
          <span className="sr-only">Curso bloqueado</span>
        </div>
      )}
    </div>
  )

  const corpo = (
    <>
      {capa}
      <h3 className="mt-2 text-sm font-medium">{item.title}</h3>
      <p className="text-xs text-texto-suave">
        {item.areaName ?? 'Trilha inicial'} · {item.lessonCount}{' '}
        {item.lessonCount === 1 ? 'aula' : 'aulas'}
        {item.requestStatus === 'pending' && ' · acesso solicitado'}
      </p>
      {item.access !== 'none' && item.progress.total > 0 && (
        <div className="mt-2">
          <ProgressBar completed={item.progress.completed} total={item.progress.total} />
        </div>
      )}
    </>
  )

  return (
    <li>
      <Link
        href={`/curso/${item.slug}`}
        // ring-acao, igual area-card.tsx: os dois cards dividem a mesma
        // grade em /area/[slug] e devem indicar foco com o mesmo tom.
        className="block rounded-card focus:outline-none focus:ring-2 focus:ring-acao"
      >
        {corpo}
      </Link>
    </li>
  )
}
