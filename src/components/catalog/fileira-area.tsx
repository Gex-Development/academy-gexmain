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
          className="shrink-0 rounded text-sm text-texto-suave transition-colors hover:text-texto focus:outline-none focus-visible:ring-2 focus-visible:ring-acao"
        >
          Ver tudo →
        </Link>
      </div>
      {/* -mx/px: a rolagem vai até a borda da tela no celular, sem a página
          ganhar rolagem horizontal (Review Focus 5). Só cursos aqui: uma
          área sem curso publicado não vira FileiraArea — ela entra na
          fileira "Em breve" única (fileira-em-breve.tsx, rodada de correção
          1), montada pela página a partir das fileiras com `items` vazio.
          scroll-px-4: scroll-snap ignora o padding do <ul> (o `px-4` acima),
          então sem isso o 1º card snapa na borda do -mx-4, 16px mais à
          esquerda que o heading (rodada de correção 2) — scroll-padding
          alinha a linha de snap com a borda visual do conteúdo. */}
      <ul className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 scroll-px-4 [scrollbar-width:thin]">
        {fileira.items.map((item) => (
          <CourseCard key={item.id} item={item} className={LARGURA} />
        ))}
      </ul>
    </section>
  )
}
