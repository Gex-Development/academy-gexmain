import Link from 'next/link'
import { CourseCard } from '@/components/catalog/course-card'
import type { Fileira } from '@/server/vitrine-query'

// Largura do card: o próximo fica cortado na borda de propósito — é o sinal
// de que a fileira rola (risco "rolagem horizontal escondendo curso", spec 13).
const LARGURA = 'w-[72%] shrink-0 snap-start sm:w-[44%] lg:w-[calc((100%-2rem)/3.3)]'

export function FileiraArea({ fileira }: { fileira: Fileira }) {
  return (
    <section aria-labelledby={`fileira-${fileira.key}`}>
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 id={`fileira-${fileira.key}`} className="text-lg font-semibold tracking-tight text-texto">
          {fileira.areaName}
        </h2>
        <Link
          href={`/area/${fileira.areaSlug}`}
          aria-label={`Ver todos os cursos de ${fileira.areaName}`}
          className="shrink-0 text-sm text-texto-suave transition-colors hover:text-texto"
        >
          Ver tudo →
        </Link>
      </div>
      {/* -mx/px: a rolagem vai até a borda da tela no celular, sem a página
          ganhar rolagem horizontal (Review Focus 5). */}
      <ul className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:thin]">
        {fileira.items.length === 0 ? (
          <li className={LARGURA}>
            <div className="flex aspect-[16/10] items-center justify-center rounded-card border border-dashed border-vidro-borda bg-vidro text-sm text-texto-suave">
              Em breve
            </div>
          </li>
        ) : (
          fileira.items.map((item) => <CourseCard key={item.id} item={item} className={LARGURA} />)
        )}
      </ul>
    </section>
  )
}
