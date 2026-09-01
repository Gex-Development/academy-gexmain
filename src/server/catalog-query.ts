// Sem 'use server': lógica pura (mapeamento de linha e agrupamento) extraída
// de catalog.ts para ficar importável por um teste de banco — mesmo motivo
// documentado em courses-query.ts. Um arquivo 'use server' só pode exportar
// funções async; sem este arquivo, a única forma de provar que a contagem de
// aulas de um curso BLOQUEADO chega correta ao CatalogItem seria chamar
// getCatalog() diretamente, o que exige cookies() de um request Next.js de
// verdade (createServerSupabase → next/headers) e lança "called outside a
// request scope" fora dele.
//
// Com este arquivo, tests/db/catalog.test.ts roda a MESMA consulta
// (SELECT_CATALOGO), a MESMA função de mapeamento (paraCatalogItem) e a MESMA
// decisão de acesso (canAccessCourse, via paraCatalogItem) que getCatalog usa,
// contra o Postgres de verdade — autenticado como alguém sem nenhum acesso ao
// curso — em vez de reimplementar a conta em paralelo e provar a suposição do
// teste, não o código real.
import { canAccessCourse, type AccessLevel, type AccessUser } from '@/lib/access'

export type CatalogItem = {
  id: string
  slug: string
  title: string
  description: string | null
  coverUrl: string | null
  areaName: string | null
  areaColor: string | null
  // Posição da ÁREA (areas.position — "Posição — Ordem na vitrine" em
  // /admin/areas). null só para a trilha inicial (área nula por definição) e
  // para um curso órfão sem área; os dois casos não competem pela ordenação
  // por posição de área (o primeiro tem seção própria, o segundo cai no
  // grupo "Outros", ver montarCatalogo).
  areaPosition: number | null
  isOnboarding: boolean
  lessonCount: number
  // Posição do próprio CURSO (courses.position) — mesmo campo que
  // listManagedCourses já usa para ordenar a tela de gestão. A vitrine
  // precisa dele para ordenar os cards dentro de cada grupo na mesma ordem
  // manual que o líder/admin configurou.
  position: number
  access: AccessLevel
  requestStatus: 'none' | 'pending'
}

export type Catalog = {
  onboarding: CatalogItem | null
  grupos: { areaName: string; items: CatalogItem[] }[]
}

export const SELECT_CATALOGO =
  'id, slug, title, description, cover_url, status, is_onboarding, area_id, position, areas(name, color, position)'

export type LinhaCatalogo = {
  id: string
  slug: string
  title: string
  description: string | null
  cover_url: string | null
  status: string
  is_onboarding: boolean
  area_id: string | null
  position: number
  areas: { name: string; color: string | null; position: number } | null
}

/**
 * Uma linha de `courses` (mais a contagem de aulas publicadas, vinda da RPC
 * `contar_aulas_publicadas` — nunca de um join com `lessons`) vira um
 * CatalogItem. Nada aqui toca aula, vídeo ou anexo: o tipo CatalogItem não tem
 * campo para isso, então mesmo um curso bloqueado só carrega capa, título,
 * área, descrição e o número de aulas.
 */
export function paraCatalogItem(
  row: LinhaCatalogo,
  user: AccessUser,
  aulasPorCurso: ReadonlyMap<string, number>,
  liberados: ReadonlySet<string>,
  pendentes: ReadonlySet<string>,
): CatalogItem {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    coverUrl: row.cover_url,
    areaName: row.areas?.name ?? null,
    areaColor: row.areas?.color ?? null,
    areaPosition: row.areas?.position ?? null,
    isOnboarding: row.is_onboarding,
    lessonCount: aulasPorCurso.get(row.id) ?? 0,
    position: row.position,
    access: canAccessCourse(
      user,
      {
        id: row.id,
        areaId: row.area_id,
        status: row.status as 'draft' | 'published',
        isOnboarding: row.is_onboarding,
      },
      liberados,
    ),
    requestStatus: pendentes.has(row.id) ? 'pending' : 'none',
  }
}

// Ordena por posição administrada primeiro (a coluna `position` — do curso
// aqui, da área em montarCatalogo — que "Posição — Ordem na vitrine" em
// /admin/areas e a reordenação de listManagedCourses já respeitam) e usa o
// nome/título como desempate, nunca o inverso. Duas posições iguais (0 é o
// padrão para quem nunca foi reordenado) caem no desempate alfabético em vez
// de na ordem de chegada do banco, que não é significativa.
function porPosicaoDepoisTitulo(a: { position: number; title: string }, b: { position: number; title: string }) {
  return a.position - b.position || a.title.localeCompare(b.title, 'pt-BR')
}

/**
 * Separa a trilha inicial (se houver) e agrupa o resto por área.
 *
 * Cada grupo carrega a posição da SUA área (não a de um item qualquer do
 * grupo, para não depender de qual item foi inserido primeiro no Map) — é o
 * que permite ordenar os grupos pela mesma coluna `areas.position` que
 * /admin/areas expõe como "Posição — Ordem na vitrine". Um curso sem área
 * (fora da trilha inicial — caso raro, mas o schema permite area_id nulo)
 * cai no grupo "Outros", que não tem posição de admin nenhuma para honrar (o
 * formulário de área não cobre esse grupo) e por isso vai sempre por último,
 * depois de todo grupo com posição definida.
 */
export function montarCatalogo(items: CatalogItem[]): Catalog {
  const onboarding = items.find((i) => i.isOnboarding) ?? null

  type Grupo = { areaName: string; areaPosition: number | null; items: CatalogItem[] }
  const porArea = new Map<string, Grupo>()

  for (const item of items) {
    if (item.isOnboarding) continue
    const chave = item.areaName ?? 'Outros'

    let grupo = porArea.get(chave)
    if (!grupo) {
      grupo = { areaName: chave, areaPosition: item.areaPosition, items: [] }
      porArea.set(chave, grupo)
    }
    grupo.items.push(item)
  }

  const SEM_POSICAO = Number.POSITIVE_INFINITY

  const grupos = [...porArea.values()]
    .sort(
      (a, b) =>
        (a.areaPosition ?? SEM_POSICAO) - (b.areaPosition ?? SEM_POSICAO) ||
        a.areaName.localeCompare(b.areaName, 'pt-BR'),
    )
    .map((grupo) => ({
      areaName: grupo.areaName,
      items: [...grupo.items].sort(porPosicaoDepoisTitulo),
    }))

  return { onboarding, grupos }
}
