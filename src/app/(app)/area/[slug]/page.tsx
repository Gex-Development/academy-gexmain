import { notFound } from 'next/navigation'
import { CourseCard } from '@/components/catalog/course-card'
import { getCatalog } from '@/server/catalog'
import { selecionarEmAndamento } from '@/server/vitrine-query'

/*
 * A página reusa getCatalog() em vez de uma consulta por área.
 *
 * Vantagem: atravessa exatamente o mesmo caminho de acesso que a vitrine —
 * mesma consulta, mesma decisão por curso, mesmos testes de banco. Uma
 * consulta nova por área seria uma segunda superfície de acesso para manter
 * em sincronia com a primeira.
 *
 * Custo: carrega o catálogo inteiro para exibir uma área. Para uma empresa de
 * algumas dezenas de pessoas e algumas dezenas de cursos, isso é uma consulta
 * pequena. Se um dia a plataforma tiver centenas de cursos, aqui é o lugar
 * de trocar por uma consulta filtrada — e o teste desta tela não muda.
 */
export default async function AreaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const catalog = await getCatalog()

  const grupo = catalog.grupos.find((g) => g.areaSlug === slug)
  if (!grupo) notFound()

  const emAndamento = selecionarEmAndamento(grupo.items)

  // Terceiro degrau da reserva de capa — mesmo raciocínio de area-card.tsx:
  // sem imagem e sem cor, bg-capa-fundo sozinho (#221f20 sobre #131213 no
  // escuro) dá 1,14:1, quase invisível. from-azul/to-ciano são tokens fixos
  // (não invertem por tema), então o gradiente fica igual nos dois temas,
  // do mesmo jeito que capa-fundo.
  const semReserva = !grupo.areaCoverUrl && !grupo.areaColor

  return (
    <div className="flex flex-col gap-8">
      <section
        className={`relative overflow-hidden rounded-card border border-borda ${
          semReserva ? 'bg-gradient-to-b from-azul to-ciano' : 'bg-capa-fundo'
        }`}
        style={grupo.areaColor && !grupo.areaCoverUrl ? { backgroundColor: grupo.areaColor } : undefined}
      >
        {grupo.areaCoverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={grupo.areaCoverUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/88 via-black/50 to-black/20" />
        <div className="relative flex min-h-36 flex-col justify-end p-6">
          <h1 className="text-2xl font-bold leading-tight text-white">{grupo.areaName}</h1>
          <p className="mt-1 text-sm text-white/75">
            {grupo.items.length} {grupo.items.length === 1 ? 'curso' : 'cursos'}
          </p>
        </div>
      </section>

      {emAndamento.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-texto-suave">
            Continue de onde parou
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {emAndamento.map((item) => (
              <CourseCard key={item.id} item={item} />
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-texto-suave">
          Todos os cursos
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {grupo.items.map((item) => (
            <CourseCard key={item.id} item={item} />
          ))}
        </ul>
      </section>
    </div>
  )
}
