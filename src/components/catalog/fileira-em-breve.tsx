import Link from 'next/link'
import { cn } from '@/lib/cn'
import type { Fileira } from '@/server/vitrine-query'

// Mesma largura de fileira-area.tsx (LARGURA lá): o próximo ladrilho fica
// cortado na borda de propósito, mesmo motivo (ver o comentário lá).
const LARGURA = 'w-[72%] shrink-0 snap-start sm:w-[44%] lg:w-[calc((100%-2rem)/3.3)]'

/**
 * Uma única fileira "Em breve", reunindo TODAS as áreas ainda sem curso
 * publicado (rodada de correção 1: com dado real, a maioria das áreas não
 * tem curso — uma fileira inteira por área vazia virava uma parede de
 * caixas em branco na home, e a capa que o dono da área já subiu nem
 * aparecia). Cada ladrilho é a própria capa da área (ou o degradê de
 * reserva), clicável, para a área continuar visível (spec §5) sem parecer
 * quebrada.
 */
export function FileiraEmBreve({ fileiras }: { fileiras: Fileira[] }) {
  return (
    <section aria-labelledby="fileira-em-breve">
      <h2 id="fileira-em-breve" className="mb-3 text-lg font-semibold tracking-tight text-texto">
        Em breve
      </h2>
      {/* -mx/px e scroll-px-4: mesmo truque de fileira-area.tsx (ver o
          comentário lá) — a rolagem vai até a borda da tela no celular sem
          rolagem horizontal na página, e scroll-px-4 evita o 1º ladrilho
          nascer 16px fora do lugar quando a fileira já rola (scroll-snap
          ignora o padding do <ul>, rodada de correção 2). */}
      <ul className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 scroll-px-4 [scrollbar-width:thin]">
        {fileiras.map((fileira) => (
          <li key={fileira.key} className={LARGURA}>
            <Link
              href={`/area/${fileira.areaSlug}`}
              className="group block rounded-card focus:outline-none focus-visible:ring-2 focus-visible:ring-acao"
            >
              <div
                className={cn(
                  'relative aspect-[16/10] overflow-hidden rounded-card border border-vidro-borda',
                  fileira.areaCoverUrl ? 'bg-capa-fundo' : 'bg-gradient-to-br from-azul to-ciano',
                )}
              >
                {fileira.areaCoverUrl && (
                  // Capa é URL externa; next/image exigiria allowlist de domínio.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={fileira.areaCoverUrl}
                    alt=""
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none"
                  />
                )}
                {/* Sem vidro (mesmo motivo de course-card.tsx): a capa já é
                    imagem, e este overlay é só para o texto ler por cima
                    dela, não uma superfície de vidro. */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-3">
                  <p className="text-sm font-semibold text-white">{fileira.areaName}</p>
                  <p className="text-xs text-white/75">Em breve</p>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
