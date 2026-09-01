import Link from 'next/link'
import type { AreaVitrine } from '@/server/vitrine-query'

export function AreaCard({ area }: { area: AreaVitrine }) {
  return (
    <li>
      <Link
        href={area.href}
        className="group block overflow-hidden rounded-card focus:outline-none focus:ring-2 focus:ring-acao"
      >
        <div
          className="relative aspect-[16/10] w-full overflow-hidden rounded-card border border-borda"
          style={area.coverUrl ? undefined : { backgroundColor: area.color ?? '#353133' }}
        >
          {area.coverUrl && (
            // Capa é URL externa informada por quem administra; next/image
            // exigiria allowlist de domínio. Mesmo mecanismo de course-card.tsx.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={area.coverUrl}
              alt=""
              className={`h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03] ${
                area.bloqueada ? 'grayscale brightness-50' : ''
              }`}
            />
          )}

          {/* Gradiente que garante leitura do texto sobre qualquer imagem. */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />

          {area.bloqueada && (
            <span
              aria-hidden
              className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full bg-black/60 text-sm"
            >
              🔒
            </span>
          )}

          <div className="absolute inset-x-0 bottom-0 p-4">
            <p className="text-base font-bold leading-tight text-white">{area.name}</p>
            <p className="mt-1 text-xs text-white/75">
              {area.isOnboarding
                ? `Trilha inicial · ${area.courseCount} ${area.courseCount === 1 ? 'aula' : 'aulas'}`
                : `${area.courseCount} ${area.courseCount === 1 ? 'curso' : 'cursos'}`}
              {area.bloqueada && ' · sem acesso'}
            </p>
          </div>
        </div>
        {area.bloqueada && <span className="sr-only">Você ainda não tem acesso a esta área</span>}
      </Link>
    </li>
  )
}
