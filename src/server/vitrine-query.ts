// Sem 'use server': lógica pura, importável por teste. Mesmo motivo
// documentado em catalog-query.ts.
//
// A vitrine é DERIVADA do catálogo: getCatalog() já devolve todo curso
// publicado com `access` calculado por curso, incluindo os bloqueados.
// Agrupar e contar não consulta o banco e não decide acesso — a decisão de
// acesso continua sendo só a de canAccessCourse, uma por curso.
import type { AreaRow } from './areas'
import type { Catalog, CatalogItem } from './catalog-query'

/** O destaque no topo da home: no máximo um dos três, nunca inventado. */
export type DestaqueHome =
  | { tipo: 'trilha'; item: CatalogItem }
  | { tipo: 'retomada' }
  | { tipo: 'nenhum' }

/**
 * Decide o que ocupa o banner da home.
 *
 * Prioridade: a trilha inicial, enquanto pendente, vem antes de qualquer
 * outra coisa — é a primeira coisa que a pessoa tem a fazer na empresa. Só
 * quando ela não existe, já foi concluída, ou a pessoa não tem acesso (nível
 * 'none') é que "continue de onde parou" assume. Sem os dois, não se inventa
 * destaque: banner falso é pior que ausência de banner (fica com quem chama
 * mostrar o cabeçalho de saudação nesse caso). Uma trilha concluída (ou
 * quase — ver o comentário sobre arredondamento abaixo) não fica sem lugar
 * nenhum na home: quando ela deixa de ser o destaque, `linhaDaTrilha` (logo
 * abaixo) põe uma fileira "Trilha inicial" no topo das fileiras.
 *
 * `temRetomada` é só um booleano — a função não precisa saber a forma do
 * "continue de onde parou" (isso é responsabilidade de getContinueWatching),
 * só se ele existe.
 */
export function escolherDestaque(onboarding: CatalogItem | null, temRetomada: boolean): DestaqueHome {
  // `!== 'none'` é defensivo, não estado possível hoje: a regra 5 de
  // canAccessCourse (src/lib/access/can-access-course.ts) devolve 'view'
  // para toda trilha PUBLICADA vista por gente ATIVA, e getCatalog() só traz
  // curso publicado para usuário ativo — as duas condições que `onboarding`,
  // quando não-nulo, já garante.
  //
  // `completed < total`, não `percent < 100`: percent é arredondado
  // (Math.round, ver buildProgress em src/lib/progress/percent.ts), então
  // uma trilha de 200 aulas com 199 concluídas já mede 100% e sumiria do
  // destaque uma aula antes de realmente terminar. completed/total não
  // arredonda nada.
  if (onboarding !== null && onboarding.access !== 'none' && onboarding.progress.completed < onboarding.progress.total) {
    return { tipo: 'trilha', item: onboarding }
  }
  if (temRetomada) {
    return { tipo: 'retomada' }
  }
  return { tipo: 'nenhum' }
}

/**
 * Acha o CatalogItem de um `slug` no catálogo já carregado — trilha inicial
 * ou qualquer grupo por área.
 *
 * Existe para o destaque "Continue de onde parou" da home: getContinueWatching()
 * (src/server/progress.ts) devolve slug e título, mas não capa — não é
 * responsabilidade dela, só diz qual é a próxima aula. Quem chama (a home) já
 * tem o catálogo inteiro em memória na mesma requisição, então achar o CatalogItem
 * aqui e passá-lo para capaComReserva é trabalho de função pura: nenhuma
 * consulta nova.
 *
 * Olha o onboarding também, não só os grupos por área: o curso "continue de
 * onde parou" pode ser a própria trilha inicial (ela também acumula
 * progresso e pode aparecer aqui quando não é mais o destaque do banner —
 * ver escolherDestaque). `null` quando o slug não aparece em lugar nenhum
 * do catálogo — não deveria acontecer (getContinueWatching só devolve curso
 * que o próprio getCourseView confirmou acessível), mas quem chama cai de
 * volta para "sem capa" em vez de lançar.
 */
export function itemDoCatalogo(catalog: Catalog, slug: string): CatalogItem | null {
  if (catalog.onboarding?.slug === slug) return catalog.onboarding

  for (const grupo of catalog.grupos) {
    const item = grupo.items.find((i) => i.slug === slug)
    if (item) return item
  }

  return null
}

export type DadosDaArea = {
  nome: string
  capaUrl: string | null
  cor: string | null
  itens: readonly CatalogItem[]
}

/**
 * O que a página de uma área precisa mostrar, venha de onde vier.
 *
 * Duas fontes possíveis: o grupo do catálogo (área COM curso publicado) ou a
 * linha da tabela de áreas (área que existe mas ainda não tem curso). Devolve
 * null quando não há nem uma nem outra — é o 404 da página.
 *
 * A FONTE É ESCOLHIDA UMA VEZ, não campo a campo. Essa distinção não é
 * estilo: a versão anterior fazia `grupo?.areaColor ?? areaVazia!.color` em
 * cada linha, e `??` não pergunta "existe grupo?", pergunta "este valor é
 * nulo?". Uma área COM curso e SEM cor caía no ramo da área vazia, que é
 * null justamente porque o grupo existe — TypeError em toda área com curso
 * publicado e cor não preenchida, que é o estado das quatro áreas reais.
 *
 * Havendo os dois, o grupo ganha: ele vem do catálogo, que já passou pela
 * decisão de acesso curso a curso.
 */
export function dadosDaArea(
  grupo: Catalog['grupos'][number] | undefined,
  areaSemCurso: AreaRow | undefined,
): DadosDaArea | null {
  if (grupo) {
    return {
      nome: grupo.areaName,
      capaUrl: grupo.areaCoverUrl,
      cor: grupo.areaColor,
      itens: grupo.items,
    }
  }
  if (areaSemCurso) {
    return {
      nome: areaSemCurso.name,
      capaUrl: areaSemCurso.coverUrl,
      cor: areaSemCurso.color,
      itens: [],
    }
  }
  return null
}

export type FiltroProgresso = 'tudo' | 'continuar' | 'nao-iniciados' | 'concluidos'

const FILTROS: readonly FiltroProgresso[] = ['tudo', 'continuar', 'nao-iniciados', 'concluidos']

/** O filtro da home vem da URL (`?filtro=`) — entrada de usuário: o que não for um valor conhecido é "tudo". */
export function lerFiltro(valor: string | string[] | undefined): FiltroProgresso {
  return typeof valor === 'string' && (FILTROS as readonly string[]).includes(valor) ? (valor as FiltroProgresso) : 'tudo'
}

/**
 * Spec 2026-09-29, seção 9.2. Curso bloqueado só aparece em "tudo": listar
 * em "Não iniciados" algo que a pessoa nem pode abrir não faz sentido.
 */
export function passaNoFiltro(item: CatalogItem, filtro: FiltroProgresso): boolean {
  if (filtro === 'tudo') return true
  if (item.access === 'none') return false
  const { completed, total } = item.progress
  if (filtro === 'continuar') return completed > 0 && completed < total
  if (filtro === 'nao-iniciados') return total > 0 && completed === 0
  return total > 0 && completed === total
}

/**
 * Capa de um curso com reserva (spec, seção 9.4): a do curso, senão a da
 * área. Null = quem desenha usa o degradê de reserva. Hoje nenhum curso tem
 * capa própria — sem este degrau a vitrine inteira seria degradê.
 */
export function capaComReserva(item: { coverUrl: string | null; areaCoverUrl: string | null }): string | null {
  return item.coverUrl ?? item.areaCoverUrl ?? null
}

export type Fileira = {
  /** Chave estável de lista React: o areaId (ou 'trilha-inicial' — ver linhaDaTrilha). */
  key: string
  areaName: string
  /**
   * Slug da ÁREA, para o link "Ver tudo →". `null` só na fileira "Trilha
   * inicial" (linhaDaTrilha): ela não é uma área, não tem página própria —
   * FileiraArea omite o link quando `areaSlug` é nulo.
   */
  areaSlug: string | null
  /**
   * Capa da ÁREA — do grupo do catálogo quando ela tem curso publicado,
   * senão da própria linha de `areas` (ver montarFileiras). Alimenta o
   * ladrilho da fileira "Em breve" (fileira-em-breve.tsx, rodada de
   * correção 1): antes de haver curso, é a única capa que a área tem.
   */
  areaCoverUrl: string | null
  /** Vazia = área sem curso publicado. A página agrupa essas fileiras numa única FileiraEmBreve, em vez de uma fileira cheia por área vazia (rodada de correção 1: a maioria das áreas reais não tem curso ainda). */
  items: CatalogItem[]
}

/**
 * A fileira "Trilha inicial" (revisão final, Important #1): a trilha é
 * curso, não área, então nunca aparece em `montarFileiras`. Enquanto está
 * pendente ela já tem o destaque do banner (escolherDestaque) — repeti-la
 * aqui embaixo seria redundante. Mas assim que ela deixa de ser o destaque
 * (concluída, ou — caso defensivo — sem acesso), ela também não tem área
 * própria para aparecer numa FileiraArea: sem esta fileira, um hire que
 * termina o onboarding perde o único caminho de volta para a trilha (o link
 * direto `/curso/<slug>` continua funcionando, mas não é navegável a partir
 * da UI).
 *
 * `passaNoFiltro` decide se ela aparece: uma trilha concluída passa em
 * "Concluídos" e some em "Não iniciados"/"Continuar", igual a qualquer outro
 * curso. `null` quando não há trilha, quando ela ainda é o destaque, ou
 * quando não passa no filtro ativo.
 */
export function linhaDaTrilha(
  onboarding: CatalogItem | null,
  destaque: DestaqueHome,
  filtro: FiltroProgresso,
): Fileira | null {
  if (onboarding === null) return null
  if (destaque.tipo === 'trilha') return null
  if (!passaNoFiltro(onboarding, filtro)) return null

  return {
    key: 'trilha-inicial',
    areaName: 'Trilha inicial',
    areaSlug: null,
    areaCoverUrl: null,
    items: [onboarding],
  }
}

/**
 * As fileiras da home (spec, seção 5): uma por área, na ordem do catálogo,
 * com as áreas sem curso no fim. Com filtro, fileira que esvazia some — e
 * área sem curso também, porque "Em breve" não é resposta a "Continuar".
 * A trilha inicial não entra aqui: ela é curso, não área — quem chama
 * (a home) prepõe a fileira de linhaDaTrilha separadamente.
 */
export function montarFileiras(
  catalog: Catalog,
  todasAsAreas: readonly AreaRow[],
  filtro: FiltroProgresso,
): Fileira[] {
  const fileiras: Fileira[] = []

  for (const grupo of catalog.grupos) {
    if (!grupo.areaSlug) continue
    const items = grupo.items.filter((i) => passaNoFiltro(i, filtro))
    if (filtro !== 'tudo' && items.length === 0) continue
    fileiras.push({
      key: grupo.groupKey,
      areaName: grupo.areaName,
      areaSlug: grupo.areaSlug,
      areaCoverUrl: grupo.areaCoverUrl,
      items,
    })
  }

  if (filtro === 'tudo') {
    const comCurso = new Set(catalog.grupos.map((g) => g.groupKey))
    for (const area of todasAsAreas) {
      if (comCurso.has(area.id)) continue
      fileiras.push({
        key: area.id,
        areaName: area.name,
        areaSlug: area.slug,
        areaCoverUrl: area.coverUrl,
        items: [],
      })
    }
  }

  return fileiras
}
