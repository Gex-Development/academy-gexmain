// Sem 'use server': lógica pura, importável por teste. Mesmo motivo
// documentado em catalog-query.ts.
//
// A vitrine é DERIVADA do catálogo: getCatalog() já devolve todo curso
// publicado com `access` calculado por curso, incluindo os bloqueados.
// Agrupar e contar não consulta o banco e não decide acesso — a decisão de
// acesso continua sendo só a de canAccessCourse, uma por curso.
import type { AreaRow } from './areas'
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
 *
 * `todasAsAreas` existe porque o catálogo parte de CURSOS: uma área recém-
 * criada, ainda sem curso publicado, não gera grupo nenhum e portanto seria
 * invisível na home. Passando a lista (listAreas(), legível por qualquer
 * colaborador ativo por RLS), as áreas que não apareceram em grupo nenhum
 * entram no fim, com contagem zero. O parâmetro é opcional e o padrão é a
 * lista vazia: sem ele o comportamento é o de antes, só quem tem curso.
 */
export function montarVitrine(catalog: Catalog, todasAsAreas: AreaRow[] = []): AreaVitrine[] {
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

  // As áreas que não apareceram em grupo nenhum: existem, mas ainda não têm
  // curso publicado. Entram DEPOIS das que têm curso, para a home abrir com
  // conteúdo em vez de com vazio.
  //
  // O casamento é por id, não por nome nem por slug: groupKey É o areaId (ver
  // montarCatalogo), `areas.name` não tem constraint de unicidade, e o slug do
  // grupo pode ser nulo (o grupo "Outros").
  const idsComCurso = new Set(catalog.grupos.map((grupo) => grupo.groupKey))

  for (const area of todasAsAreas) {
    if (idsComCurso.has(area.id)) continue

    areas.push({
      key: area.id,
      href: `/area/${area.slug}`,
      name: area.name,
      coverUrl: area.coverUrl,
      color: area.color,
      courseCount: 0,
      // Nunca bloqueada, de propósito. `items.every(...)` sobre lista vazia
      // é `true` por vacuidade, o que marcaria toda área vazia como "sem
      // acesso" — e o cadeado convida a pedir acesso a uma área onde não há
      // nada para liberar. Sem curso não há o que proteger; o cadeado
      // aparece quando existir o primeiro curso inacessível.
      bloqueada: false,
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
 * Acha o CatalogItem de um `slug` no catálogo já carregado — trilha inicial
 * ou qualquer grupo por área. Privada: capaDoCurso e corDaAreaDoCurso fazem
 * a mesma busca por motivos diferentes (o banner "Continue de onde parou"
 * precisa dos dois campos do MESMO curso — capa como degrau 1 da reserva,
 * cor de área como degrau 2, ver hero-banner.tsx), então a travessia mora
 * aqui uma vez só em vez de duplicada nas duas funções públicas.
 *
 * Olha o onboarding também, não só os grupos por área: o curso "continue de
 * onde parou" pode ser a própria trilha inicial (ela também acumula
 * progresso e pode aparecer aqui quando não é mais o destaque do banner —
 * ver escolherDestaque). `null` quando o slug não aparece em lugar nenhum
 * do catálogo — não deveria acontecer (getContinueWatching só devolve curso
 * que o próprio getCourseView confirmou acessível), mas as duas funções
 * públicas caem de volta para "sem capa"/"sem cor" em vez de lançar.
 */
function encontrarItemDoCatalogo(catalog: Catalog, slug: string): CatalogItem | null {
  if (catalog.onboarding?.slug === slug) return catalog.onboarding

  for (const grupo of catalog.grupos) {
    const item = grupo.items.find((i) => i.slug === slug)
    if (item) return item
  }

  return null
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
 */
export function capaDoCurso(catalog: Catalog, slug: string): string | null {
  return encontrarItemDoCatalogo(catalog, slug)?.coverUrl ?? null
}

/**
 * A cor da ÁREA do curso de `slug` — o degrau 2 da reserva de capa do
 * banner "Continue de onde parou" (ver hero-banner.tsx): sem capa própria,
 * o curso empresta a cor da área, do mesmo jeito que course-card.tsx e
 * locked-course.tsx já fazem com `item.areaColor`/`course.areaColor`. Para
 * a trilha inicial, é sempre `null` (area_id é nulo por definição — ver o
 * comentário em catalog-query.ts), o que é correto: a trilha não tem área
 * para emprestar cor nenhuma, então o banner cai direto no degrau 3
 * (gradiente).
 */
export function corDaAreaDoCurso(catalog: Catalog, slug: string): string | null {
  return encontrarItemDoCatalogo(catalog, slug)?.areaColor ?? null
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
