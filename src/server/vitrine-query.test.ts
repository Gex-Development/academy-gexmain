import { describe, expect, it } from 'vitest'
import type { Catalog, CatalogItem } from './catalog-query'
import { escolherDestaque, montarVitrine } from './vitrine-query'

function item(over: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id: 'c1',
    slug: 'curso-1',
    title: 'Curso 1',
    description: null,
    coverUrl: null,
    areaId: 'a1',
    areaName: 'Copy',
    areaSlug: 'copy',
    areaCoverUrl: 'https://exemplo.test/copy.png',
    areaColor: '#004EAC',
    areaPosition: 0,
    isOnboarding: false,
    lessonCount: 3,
    position: 0,
    access: 'view',
    requestStatus: 'none',
    progress: { completed: 0, total: 3, percent: 0 },
    ...over,
  }
}

function catalogo(grupos: Catalog['grupos'], onboarding: CatalogItem | null = null): Catalog {
  return { onboarding, grupos }
}

function grupo(over: Partial<Catalog['grupos'][number]> = {}): Catalog['grupos'][number] {
  return {
    groupKey: 'a1',
    areaName: 'Copy',
    areaSlug: 'copy',
    areaCoverUrl: 'https://exemplo.test/copy.png',
    areaColor: '#004EAC',
    items: [item()],
    ...over,
  }
}

describe('montarVitrine', () => {
  it('cada grupo de área vira uma capa, com contagem e destino', () => {
    const vitrine = montarVitrine(catalogo([grupo({ items: [item(), item({ id: 'c2' })] })]))

    expect(vitrine).toHaveLength(1)
    expect(vitrine[0].name).toBe('Copy')
    expect(vitrine[0].href).toBe('/area/copy')
    expect(vitrine[0].courseCount).toBe(2)
    expect(vitrine[0].coverUrl).toBe('https://exemplo.test/copy.png')
  })

  it('a contagem inclui curso bloqueado — é o número que faz a pessoa pedir acesso', () => {
    const vitrine = montarVitrine(
      catalogo([grupo({ items: [item({ access: 'view' }), item({ id: 'c2', access: 'none' })] })]),
    )

    expect(vitrine[0].courseCount).toBe(2)
  })

  it('área fica bloqueada só quando NENHUM curso dela é acessível', () => {
    const nenhum = montarVitrine(
      catalogo([grupo({ items: [item({ access: 'none' }), item({ id: 'c2', access: 'none' })] })]),
    )
    expect(nenhum[0].bloqueada).toBe(true)

    // Um único curso liberado — por área ou por liberação avulsa — destrava a capa.
    const um = montarVitrine(
      catalogo([grupo({ items: [item({ access: 'none' }), item({ id: 'c2', access: 'view' })] })]),
    )
    expect(um[0].bloqueada).toBe(false)
  })

  it('a trilha inicial vem primeiro e aponta para o curso, não para uma área', () => {
    const vitrine = montarVitrine(
      catalogo([grupo()], item({ id: 'onb', slug: 'trilha-inicial', isOnboarding: true, areaId: null, areaName: null, areaSlug: null, areaCoverUrl: null })),
    )

    expect(vitrine[0].isOnboarding).toBe(true)
    expect(vitrine[0].href).toBe('/curso/trilha-inicial')
    expect(vitrine[1].name).toBe('Copy')
  })

  it('a capa da trilha inicial é a capa do próprio curso', () => {
    const vitrine = montarVitrine(
      catalogo([], item({ isOnboarding: true, slug: 't', coverUrl: 'https://exemplo.test/onb.png', areaCoverUrl: null })),
    )

    expect(vitrine[0].coverUrl).toBe('https://exemplo.test/onb.png')
  })

  it('mantém a ordem dos grupos que o catálogo já ordenou por posição de área', () => {
    const vitrine = montarVitrine(
      catalogo([
        grupo({ groupKey: 'a1', areaName: 'Copy', areaSlug: 'copy' }),
        grupo({ groupKey: 'a2', areaName: 'Tráfego', areaSlug: 'trafego' }),
      ]),
    )

    expect(vitrine.map((a) => a.name)).toEqual(['Copy', 'Tráfego'])
  })

  it('grupo sem slug (curso órfão, o grupo "Outros") não vira capa — não teria para onde levar', () => {
    const vitrine = montarVitrine(catalogo([grupo({ areaName: 'Outros', areaSlug: null })]))

    expect(vitrine).toEqual([])
  })
})

describe('escolherDestaque', () => {
  it('trilha pendente e acessível → trilha', () => {
    const onboarding = item({
      isOnboarding: true,
      access: 'view',
      progress: { completed: 1, total: 4, percent: 25 },
    })

    expect(escolherDestaque(onboarding, true)).toEqual({ tipo: 'trilha', item: onboarding })
    // A prioridade da trilha não depende de haver retomada ou não.
    expect(escolherDestaque(onboarding, false)).toEqual({ tipo: 'trilha', item: onboarding })
  })

  it('trilha 100% concluída e há retomada → retomada', () => {
    const onboarding = item({
      isOnboarding: true,
      access: 'view',
      progress: { completed: 4, total: 4, percent: 100 },
    })

    expect(escolherDestaque(onboarding, true)).toEqual({ tipo: 'retomada' })
  })

  it('não existe trilha no sistema e há retomada → retomada', () => {
    expect(escolherDestaque(null, true)).toEqual({ tipo: 'retomada' })
  })

  it('trilha existe mas access é none e há retomada → retomada', () => {
    const onboarding = item({
      isOnboarding: true,
      access: 'none',
      progress: { completed: 0, total: 4, percent: 0 },
    })

    expect(escolherDestaque(onboarding, true)).toEqual({ tipo: 'retomada' })
  })

  it('nada em andamento e trilha concluída → nenhum', () => {
    const onboarding = item({
      isOnboarding: true,
      access: 'view',
      progress: { completed: 4, total: 4, percent: 100 },
    })

    expect(escolherDestaque(onboarding, false)).toEqual({ tipo: 'nenhum' })
  })

  it('sem trilha e sem retomada → nenhum', () => {
    expect(escolherDestaque(null, false)).toEqual({ tipo: 'nenhum' })
  })
})
