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
 * mostrar o cabeçalho de saudação nesse caso).
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
  if (onboarding !== null && onboarding.access !== 'none' && onboarding.progress.percent < 100) {
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

/**
 * A fileira "Continue de onde parou" de uma página de área.
 *
 * Um curso entra quando a pessoa ainda tem acesso a ele, já começou
 * (`completed > 0`) e ainda não terminou. "Ainda não terminou" é
 * `completed < total`, não `percent < 100`: `percent` vem de
 * `Math.round` (src/lib/progress/percent.ts) e arredonda para cima perto do
 * fim — 199 de 200 aulas dá 99,5%, que vira 100 e faria o curso sumir da
 * fileira mesmo inacabado. `completed`/`total` não perde essa borda.
 *
 * `access !== 'none'` cobre a pessoa que começou o curso e depois perdeu o
 * acesso (liberação avulsa revogada, por exemplo) — ela não vê mais um
 * "continue" para algo que não pode abrir.
 *
 * Só filtra: a ordem de entrada, já decidida pelo catálogo, é preservada.
 */
export function selecionarEmAndamento(items: readonly CatalogItem[]): CatalogItem[] {
  return items.filter(
    (item) =>
      item.access !== 'none' && item.progress.completed > 0 && item.progress.completed < item.progress.total,
  )
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
  /** Chave estável de lista React: o areaId. */
  key: string
  areaName: string
  areaSlug: string
  /** Vazia = área sem curso publicado: a fileira mostra um card "Em breve". */
  items: CatalogItem[]
}

/**
 * As fileiras da home (spec, seção 5): uma por área, na ordem do catálogo,
 * com as áreas sem curso no fim. Com filtro, fileira que esvazia some — e
 * área sem curso também, porque "Em breve" não é resposta a "Continuar".
 * A trilha inicial não entra: ela é curso, não área, e tem o destaque.
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
    fileiras.push({ key: grupo.groupKey, areaName: grupo.areaName, areaSlug: grupo.areaSlug, items })
  }

  if (filtro === 'tudo') {
    const comCurso = new Set(catalog.grupos.map((g) => g.groupKey))
    for (const area of todasAsAreas) {
      if (comCurso.has(area.id)) continue
      fileiras.push({ key: area.id, areaName: area.name, areaSlug: area.slug, items: [] })
    }
  }

  return fileiras
}
