// Sem 'use server': lógica pura, importável por teste. Mesmo motivo
// documentado em catalog-query.ts.
//
// A vitrine é DERIVADA do catálogo: getCatalog() já devolve todo curso
// publicado com `access` calculado por curso, incluindo os bloqueados.
// Agrupar e contar não consulta o banco e não decide acesso — a decisão de
// acesso continua sendo só a de canAccessCourse, uma por curso.
import type { Catalog, CatalogItem } from './catalog-query'

export type AreaVitrine = {
  /** Chave estável de lista React: areaId, ou 'onboarding'. */
  key: string
  href: string
  name: string
  coverUrl: string | null
  color: string | null
  courseCount: number
  bloqueada: boolean
  isOnboarding: boolean
}

/**
 * As capas da página inicial.
 *
 * A trilha inicial vem primeiro e leva direto ao curso: ela é um curso, não
 * uma área, e não ganha página intermediária.
 *
 * Uma área fica `bloqueada` quando NENHUM curso publicado dela é acessível.
 * Basta um curso liberado — pela área da pessoa ou por liberação avulsa —
 * para a capa aparecer normal. A capa bloqueada continua clicável: a pessoa
 * entra, vê o que existe e pede acesso.
 */
export function montarVitrine(catalog: Catalog): AreaVitrine[] {
  const areas: AreaVitrine[] = []

  if (catalog.onboarding) {
    const onb = catalog.onboarding
    areas.push({
      key: 'onboarding',
      href: `/curso/${onb.slug}`,
      name: onb.title,
      coverUrl: onb.coverUrl,
      color: null,
      courseCount: onb.lessonCount,
      // Defensivo, não estado possível hoje: a regra 5 de canAccessCourse
      // (src/lib/access/can-access-course.ts) devolve 'view' para toda
      // trilha PUBLICADA vista por gente ATIVA, e getCatalog() só traz
      // curso publicado para usuário ativo — as duas condições que
      // catalog.onboarding, quando não-nulo, já garante. onb.access nunca
      // é 'none' na prática; o `=== 'none'` fica pela mesma razão que o
      // resto do arquivo trata acesso por regra, não por suposição.
      bloqueada: onb.access === 'none',
      isOnboarding: true,
    })
  }

  for (const grupo of catalog.grupos) {
    // O grupo "Outros" (cursos com area_id nulo que não são a trilha) não tem
    // slug e portanto não tem página de área para onde levar. Fica de fora da
    // vitrine em vez de virar uma capa que não clica — e, na prática, fica de
    // fora de TODA tela de navegação, não só desta: sem areaSlug também não
    // existe /area/[slug] para ele. Um curso assim só é alcançável por link
    // direto a /curso/[slug], por quem já souber o slug de cor.
    if (!grupo.areaSlug) continue

    areas.push({
      key: grupo.groupKey,
      href: `/area/${grupo.areaSlug}`,
      name: grupo.areaName,
      coverUrl: grupo.areaCoverUrl,
      color: grupo.areaColor,
      courseCount: grupo.items.length,
      bloqueada: grupo.items.every((item) => item.access === 'none'),
      isOnboarding: false,
    })
  }

  return areas
}

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
  // `!== 'none'` também é defensivo aqui, mesmo raciocínio do comentário em
  // montarVitrine (acima, no bloco do onboarding): access nunca é 'none' para
  // uma trilha que chegou até este ponto como CatalogItem não-nulo.
  if (onboarding !== null && onboarding.access !== 'none' && onboarding.progress.percent < 100) {
    return { tipo: 'trilha', item: onboarding }
  }
  if (temRetomada) {
    return { tipo: 'retomada' }
  }
  return { tipo: 'nenhum' }
}

/**
 * A capa do curso de `slug`, procurada no catálogo já carregado.
 *
 * Existe para o banner "Continue de onde parou" da home: a §5.1.2 da spec
 * pede a capa do CURSO, mas getContinueWatching() (src/server/progress.ts)
 * não devolve capa — não é responsabilidade dela, só diz qual é a próxima
 * aula. Quem chama (a home) já tem o catálogo inteiro em memória na mesma
 * requisição, então procurar o slug aqui é trabalho de função pura: nenhuma
 * consulta nova.
 *
 * Olha o onboarding também, não só os grupos por área: o curso "continue de
 * onde parou" pode ser a própria trilha inicial (ela também acumula
 * progresso e pode aparecer aqui quando não é mais o destaque do banner —
 * ver escolherDestaque). `null` quando o slug não aparece em lugar nenhum
 * do catálogo — não deveria acontecer (getContinueWatching só devolve curso
 * que o próprio getCourseView confirmou acessível), mas cai de volta para
 * "sem capa" em vez de lançar.
 */
export function capaDoCurso(catalog: Catalog, slug: string): string | null {
  if (catalog.onboarding?.slug === slug) return catalog.onboarding.coverUrl

  for (const grupo of catalog.grupos) {
    const item = grupo.items.find((i) => i.slug === slug)
    if (item) return item.coverUrl
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
export function selecionarEmAndamento(items: CatalogItem[]): CatalogItem[] {
  return items.filter(
    (item) =>
      item.access !== 'none' && item.progress.completed > 0 && item.progress.completed < item.progress.total,
  )
}
