import { describe, expect, it } from 'vitest'
import type { AccessUser } from '@/lib/access'
import { montarCatalogo, paraCatalogItem, type LinhaCatalogo } from './catalog-query'

function linha(over: Partial<LinhaCatalogo> = {}): LinhaCatalogo {
  return {
    id: 'c1',
    slug: 'curso-1',
    title: 'Curso 1',
    description: null,
    cover_url: null,
    status: 'published',
    is_onboarding: false,
    area_id: 'area-trafego',
    position: 0,
    areas: { name: 'Tráfego', color: '#2f6bff', position: 0 },
    ...over,
  }
}

// Colaborador de uma área diferente da do curso — o caso "vitrine mostra,
// conteúdo não": vê o card, não abre o curso.
const bloqueado: AccessUser = { id: 'u1', role: 'member', status: 'active', areaId: 'area-outra' }

describe('paraCatalogItem — contagem de aulas independe do acesso', () => {
  it('curso bloqueado mantém a contagem vinda da RPC — não zera, não vem da linha de lessons', () => {
    const aulasPorCurso = new Map([['c1', 5]])
    const item = paraCatalogItem(linha(), bloqueado, aulasPorCurso, new Set(), new Set())
    expect(item.access).toBe('none')
    expect(item.lessonCount).toBe(5)
  })

  it('curso sem entrada no mapa (nenhuma aula publicada) mostra 0, não erro', () => {
    const item = paraCatalogItem(linha(), bloqueado, new Map(), new Set(), new Set())
    expect(item.lessonCount).toBe(0)
  })

  it('liberação individual muda o acesso para "view" sem alterar a contagem', () => {
    const aulasPorCurso = new Map([['c1', 2]])
    const item = paraCatalogItem(linha(), bloqueado, aulasPorCurso, new Set(['c1']), new Set())
    expect(item.access).toBe('view')
    expect(item.lessonCount).toBe(2)
  })

  it('marca requestStatus "pending" quando o curso está no conjunto de solicitações', () => {
    const item = paraCatalogItem(linha(), bloqueado, new Map(), new Set(), new Set(['c1']))
    expect(item.requestStatus).toBe('pending')
  })

  it('CatalogItem nunca carrega campo de aula, vídeo ou anexo — só as chaves do tipo', () => {
    const item = paraCatalogItem(linha(), bloqueado, new Map([['c1', 3]]), new Set(), new Set())
    expect(Object.keys(item).sort()).toEqual(
      [
        'access',
        'areaColor',
        'areaName',
        'coverUrl',
        'description',
        'id',
        'isOnboarding',
        'lessonCount',
        'requestStatus',
        'slug',
        'title',
      ].sort(),
    )
  })
})

describe('montarCatalogo — separação e agrupamento', () => {
  it('vitrine vazia: nenhuma trilha inicial, nenhum grupo', () => {
    expect(montarCatalogo([])).toEqual({ onboarding: null, grupos: [] })
  })

  it('separa a trilha inicial dos grupos por área', () => {
    const trilha = paraCatalogItem(
      linha({ id: 'o1', is_onboarding: true, area_id: null, areas: null }),
      bloqueado,
      new Map(),
      new Set(),
      new Set(),
    )
    const curso = paraCatalogItem(linha({ id: 'c1' }), bloqueado, new Map(), new Set(), new Set())

    const catalogo = montarCatalogo([trilha, curso])
    expect(catalogo.onboarding?.id).toBe('o1')
    expect(catalogo.grupos).toHaveLength(1)
    expect(catalogo.grupos[0]!.items.map((i) => i.id)).toEqual(['c1'])
  })

  it('agrupa por área e ordena grupos e cursos em ordem alfabética pt-BR', () => {
    const zebra = paraCatalogItem(
      linha({ id: 'z1', title: 'Zebra', areas: { name: 'Zoologia', color: null, position: 0 } }),
      bloqueado,
      new Map(),
      new Set(),
      new Set(),
    )
    const agua = paraCatalogItem(
      linha({ id: 'a2', title: 'Água', areas: { name: 'Agropecuária', color: null, position: 0 } }),
      bloqueado,
      new Map(),
      new Set(),
      new Set(),
    )
    const abelha = paraCatalogItem(
      linha({ id: 'a1', title: 'Abelha', areas: { name: 'Agropecuária', color: null, position: 0 } }),
      bloqueado,
      new Map(),
      new Set(),
      new Set(),
    )

    const catalogo = montarCatalogo([zebra, agua, abelha])
    expect(catalogo.grupos.map((g) => g.areaName)).toEqual(['Agropecuária', 'Zoologia'])
    expect(catalogo.grupos[0]!.items.map((i) => i.title)).toEqual(['Abelha', 'Água'])
  })

  it('curso sem área (fora da trilha inicial) cai no grupo "Outros"', () => {
    const orfao = paraCatalogItem(
      linha({ id: 'x1', area_id: null, areas: null }),
      bloqueado,
      new Map(),
      new Set(),
      new Set(),
    )
    const catalogo = montarCatalogo([orfao])
    expect(catalogo.grupos.map((g) => g.areaName)).toEqual(['Outros'])
  })
})
