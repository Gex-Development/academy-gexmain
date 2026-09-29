import Link from 'next/link'
import { CourseCard } from '@/components/catalog/course-card'
import { FileiraRolavel } from '@/components/catalog/fileira-rolavel'
import type { Fileira } from '@/server/vitrine-query'

// Largura do card: o próximo fica cortado na borda de propósito — é o sinal
// de que a fileira rola (risco "rolagem horizontal escondendo curso", spec 13).
const LARGURA = 'w-[72%] shrink-0 snap-start sm:w-[44%] lg:w-[calc((100%-2rem)/3.3)]'

export function FileiraArea({ fileira }: { fileira: Fileira }) {
  return (
    <FileiraRolavel
      tituloId={`fileira-${fileira.key}`}
      titulo={fileira.areaName}
      extra={
        // areaSlug é nulo só na fileira "Trilha inicial" (vitrine-query.ts,
        // linhaDaTrilha): a trilha não é área, não tem página própria para
        // "Ver tudo →" apontar.
        fileira.areaSlug && (
          <Link
            href={`/area/${fileira.areaSlug}`}
            aria-label={`Ver todos os cursos de ${fileira.areaName}`}
            className="rounded text-sm text-texto-suave transition-colors hover:text-texto focus:outline-none focus-visible:ring-2 focus-visible:ring-acao"
          >
            Ver tudo →
          </Link>
        )
      }
    >
      {/* Só cursos aqui: uma área sem curso publicado não vira FileiraArea —
          ela entra na fileira "Em breve" única (fileira-em-breve.tsx). */}
      {fileira.items.map((item) => (
        <CourseCard key={item.id} item={item} className={LARGURA} />
      ))}
    </FileiraRolavel>
  )
}
