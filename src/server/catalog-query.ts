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
  isOnboarding: boolean
  lessonCount: number
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
    isOnboarding: row.is_onboarding,
    lessonCount: aulasPorCurso.get(row.id) ?? 0,
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

/** Separa a trilha inicial (se houver) e agrupa o resto por área. */
export function montarCatalogo(items: CatalogItem[]): Catalog {
  const onboarding = items.find((i) => i.isOnboarding) ?? null

  const porArea = new Map<string, CatalogItem[]>()
  for (const item of items) {
    if (item.isOnboarding) continue
    const chave = item.areaName ?? 'Outros'
    porArea.set(chave, [...(porArea.get(chave) ?? []), item])
  }

  const grupos = [...porArea.entries()]
    .map(([areaName, lista]) => ({
      areaName,
      items: lista.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')),
    }))
    .sort((a, b) => a.areaName.localeCompare(b.areaName, 'pt-BR'))

  return { onboarding, grupos }
}
