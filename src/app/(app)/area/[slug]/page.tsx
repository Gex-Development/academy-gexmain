import { notFound } from 'next/navigation'
import { CourseCard } from '@/components/catalog/course-card'
import { listAreas } from '@/server/areas'
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

  // Uma área que existe mas ainda não tem curso publicado não aparece em
  // catalog.grupos — o catálogo parte de cursos. Antes isso caía em
  // notFound(), o que transformava toda área recém-criada num 404 assim que
  // ela virou clicável na home. Só quando não há grupo é que consultamos a
  // lista de áreas: no caminho comum, com curso, não há consulta extra.
  const areaVazia = grupo ? null : (await listAreas()).find((a) => a.slug === slug)
  if (!grupo && !areaVazia) notFound()

  const nome = grupo?.areaName ?? areaVazia!.name
  const capaDaArea = grupo?.areaCoverUrl ?? areaVazia!.coverUrl
  const corDaArea = grupo?.areaColor ?? areaVazia!.color
  const itens = grupo?.items ?? []

  const emAndamento = selecionarEmAndamento(itens)

  // Terceiro degrau da reserva de capa — mesmo raciocínio de area-card.tsx:
  // sem imagem e sem cor, bg-capa-fundo sozinho (#221f20 sobre #131213 no
  // escuro) dá 1,14:1, quase invisível. from-azul/to-ciano são tokens fixos
  // (não invertem por tema), então o gradiente fica igual nos dois temas,
  // do mesmo jeito que capa-fundo.
  const semReserva = !capaDaArea && !corDaArea

  return (
    <div className="flex flex-col gap-8">
      <section
        className={`relative overflow-hidden rounded-card border border-borda ${
          semReserva ? 'bg-gradient-to-b from-azul to-ciano' : 'bg-capa-fundo'
        }`}
        style={corDaArea && !capaDaArea ? { backgroundColor: corDaArea } : undefined}
      >
        {capaDaArea && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={capaDaArea}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        {/*
          Gradiente que garante leitura do texto sobre qualquer imagem —
          mesma função e mesmo raciocínio do overlay em area-card.tsx (ver
          o comentário lá), com os stops próprios desta faixa (88%/50%/20%,
          não 85%/25%/transparente). Também é a garantia de contraste do
          degrau 3 da reserva acima (from-azul to-ciano): pior ponto medido
          em toda a altura é 9,51:1 (a ~72% de distância do fundo) — nunca
          abaixo de 4,5:1, mesmo no topo, onde este overlay não some de
          todo (fica em 20%, não transparente): base azul crua já passa
          sozinha (7,82:1). Se este overlay virar condicional a
          areaCoverUrl algum dia, o degrau 3 volta a ficar exposto sem
          nenhum teste avisando — conferir de novo antes.
        */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/88 via-black/50 to-black/20" />
        <div className="relative flex min-h-36 flex-col justify-end p-6">
          <h1 className="text-2xl font-bold leading-tight text-white">{nome}</h1>
          <p className="mt-1 text-sm text-white/75">
            {itens.length === 0
              ? 'Nenhum curso ainda'
              : `${itens.length} ${itens.length === 1 ? 'curso' : 'cursos'}`}
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
        {itens.length === 0 ? (
          <p className="text-sm text-texto-suave">
            Nenhum curso publicado nesta área ainda. Assim que o líder publicar o primeiro, ele
            aparece aqui.
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {itens.map((item) => (
              <CourseCard key={item.id} item={item} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
