import { describe, expect, it } from 'vitest'
import type { AreaRow } from './areas'
import type { Catalog, CatalogItem } from './catalog-query'
import {
  capaComReserva,
  dadosDaArea,
  escolherDestaque,
  itemDoCatalogo,
  lerFiltro,
  linhaDaTrilha,
  montarFileiras,
  passaNoFiltro,
} from './vitrine-query'

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

function areaRow(over: Partial<AreaRow> = {}): AreaRow {
  return {
    id: 'a1',
    name: 'Copy',
    slug: 'copy',
    description: null,
    color: '#004EAC',
    position: 0,
    coverUrl: 'https://exemplo.test/copy.png',
    ...over,
  }
}

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

  // Revisão final, Important #1: percent é arredondado (Math.round), então
  // uma trilha longa quase concluída já mede 100% antes de completed==total.
  // escolherDestaque tem que comparar completed/total, não percent, ou a
  // trilha sai do destaque uma aula antes da hora.
  it('199 de 200 aulas: percent já arredonda pra 100, mas completed < total — continua trilha', () => {
    const onboarding = item({
      isOnboarding: true,
      access: 'view',
      progress: { completed: 199, total: 200, percent: 100 },
    })

    expect(escolherDestaque(onboarding, true)).toEqual({ tipo: 'trilha', item: onboarding })
  })
})

// ── A página de área: de onde vêm nome, capa e cor ──────────────────────────
//
// Regressão real, encontrada em produção-local: a página escolhia a fonte
// CAMPO A CAMPO com `??` (`grupo?.areaColor ?? areaVazia!.color`). `??` não
// pergunta "existe grupo?", pergunta "este valor é nulo?" — então uma área
// COM curso e SEM cor caía no ramo da área vazia, que é null exatamente
// porque o grupo existe. Resultado: TypeError em toda área que tivesse curso
// publicado e cor nula. As quatro áreas reais têm cor nula.
describe('dadosDaArea', () => {
  const linha = (over: Partial<AreaRow> = {}): AreaRow => areaRow(over)

  it('área COM curso e SEM cor usa o grupo, não a área vazia', () => {
    const dados = dadosDaArea(grupo({ areaColor: null }), undefined)

    expect(dados).not.toBeNull()
    expect(dados!.cor).toBeNull()
    expect(dados!.nome).toBe('Copy')
  })

  it('área COM curso e SEM capa usa o grupo, não a área vazia', () => {
    const dados = dadosDaArea(grupo({ areaCoverUrl: null }), undefined)

    expect(dados!.capaUrl).toBeNull()
    expect(dados!.itens).toHaveLength(1)
  })

  it('área SEM curso usa a linha da área, com lista de cursos vazia', () => {
    const dados = dadosDaArea(undefined, linha({ name: 'Backend', color: '#004EAC' }))

    expect(dados!.nome).toBe('Backend')
    expect(dados!.cor).toBe('#004EAC')
    expect(dados!.itens).toEqual([])
  })

  it('área sem curso E sem cor não explode — devolve nulo no campo, não erro', () => {
    const dados = dadosDaArea(undefined, linha({ color: null, coverUrl: null }))

    expect(dados!.cor).toBeNull()
    expect(dados!.capaUrl).toBeNull()
  })

  it('nem grupo nem área devolve null — é o 404 da página', () => {
    expect(dadosDaArea(undefined, undefined)).toBeNull()
  })

  it('havendo grupo, a linha da área é ignorada — o grupo é a fonte', () => {
    // Se as duas chegarem, a fonte é o grupo: ele reflete o catálogo, que já
    // passou pela decisão de acesso.
    const dados = dadosDaArea(grupo({ areaName: 'Do grupo' }), linha({ name: 'Da linha' }))

    expect(dados!.nome).toBe('Do grupo')
  })
})

describe('lerFiltro', () => {
  it.each([
    ['continuar', 'continuar'],
    ['nao-iniciados', 'nao-iniciados'],
    ['concluidos', 'concluidos'],
    ['tudo', 'tudo'],
  ])('%s → %s', (valor, esperado) => {
    expect(lerFiltro(valor)).toBe(esperado)
  })
  // Review Focus 1: URL é entrada de usuário.
  it('ausente, desconhecido ou repetido → tudo', () => {
    expect(lerFiltro(undefined)).toBe('tudo')
    expect(lerFiltro('xyz')).toBe('tudo')
    expect(lerFiltro(['continuar', 'concluidos'])).toBe('tudo')
  })
})

describe('passaNoFiltro', () => {
  const p = (completed: number, total: number) => ({ completed, total, percent: total ? Math.round((completed / total) * 100) : 0 })

  it('tudo aceita inclusive bloqueado', () => {
    expect(passaNoFiltro(item({ access: 'none' }), 'tudo')).toBe(true)
  })
  it('bloqueado não entra em nenhum outro filtro', () => {
    const bloqueado = item({ access: 'none', progress: p(0, 3) })
    expect(passaNoFiltro(bloqueado, 'nao-iniciados')).toBe(false)
    expect(passaNoFiltro(bloqueado, 'continuar')).toBe(false)
    expect(passaNoFiltro(bloqueado, 'concluidos')).toBe(false)
  })
  it('continuar = começou e não terminou', () => {
    expect(passaNoFiltro(item({ progress: p(1, 3) }), 'continuar')).toBe(true)
    expect(passaNoFiltro(item({ progress: p(0, 3) }), 'continuar')).toBe(false)
    expect(passaNoFiltro(item({ progress: p(3, 3) }), 'continuar')).toBe(false)
  })
  it('não iniciados = nada concluído, com aula', () => {
    expect(passaNoFiltro(item({ progress: p(0, 3) }), 'nao-iniciados')).toBe(true)
    expect(passaNoFiltro(item({ progress: p(0, 0) }), 'nao-iniciados')).toBe(false)
  })
  it('concluídos = todas, com aula', () => {
    expect(passaNoFiltro(item({ progress: p(3, 3) }), 'concluidos')).toBe(true)
    expect(passaNoFiltro(item({ progress: p(0, 0) }), 'concluidos')).toBe(false)
  })
})

describe('capaComReserva', () => {
  it('prefere a capa do curso', () => {
    expect(capaComReserva({ coverUrl: 'c.png', areaCoverUrl: 'a.png' })).toBe('c.png')
  })
  it('sem capa do curso, usa a da área', () => {
    expect(capaComReserva({ coverUrl: null, areaCoverUrl: 'a.png' })).toBe('a.png')
  })
  it('sem nenhuma, null — quem desenha usa o degradê de reserva', () => {
    expect(capaComReserva({ coverUrl: null, areaCoverUrl: null })).toBeNull()
  })
})

describe('itemDoCatalogo', () => {
  it('acha em qualquer grupo e na trilha', () => {
    const cat = catalogo([grupo({ items: [item({ slug: 'x' })] })], item({ slug: 'trilha', isOnboarding: true }))
    expect(itemDoCatalogo(cat, 'x')?.slug).toBe('x')
    expect(itemDoCatalogo(cat, 'trilha')?.slug).toBe('trilha')
    expect(itemDoCatalogo(cat, 'nao-existe')).toBeNull()
  })
})

describe('montarFileiras', () => {
  const p = (completed: number, total: number) => ({ completed, total, percent: total ? Math.round((completed / total) * 100) : 0 })

  it('uma fileira por área com curso, na ordem do catálogo', () => {
    const cat = catalogo([
      grupo({ groupKey: 'a1', areaName: 'Copy', areaSlug: 'copy', items: [item({ id: 'c1' })] }),
      grupo({ groupKey: 'a2', areaName: 'Tráfego', areaSlug: 'trafego', items: [item({ id: 'c2' })] }),
    ])
    expect(montarFileiras(cat, [], 'tudo').map((f) => f.areaSlug)).toEqual(['copy', 'trafego'])
  })
  it('área sem curso entra no fim, vazia (agrupada na fileira "Em breve" pela página)', () => {
    const cat = catalogo([grupo({ groupKey: 'a1', areaSlug: 'copy', items: [item()] })])
    const fileiras = montarFileiras(cat, [areaRow({ id: 'a1', slug: 'copy' }), areaRow({ id: 'a9', name: 'Design', slug: 'design' })], 'tudo')
    expect(fileiras.map((f) => [f.areaSlug, f.items.length])).toEqual([['copy', 1], ['design', 0]])
  })
  // Rodada de correção 1: FileiraEmBreve usa areaCoverUrl para o ladrilho de
  // cada área sem curso, então a fonte precisa ser a certa nos dois casos.
  it('areaCoverUrl vem do GRUPO quando a área tem curso, e da LINHA de áreas quando não tem', () => {
    const cat = catalogo([
      grupo({
        groupKey: 'a1',
        areaSlug: 'copy',
        areaCoverUrl: 'https://exemplo.test/capa-do-grupo.png',
        items: [item()],
      }),
    ])
    const fileiras = montarFileiras(
      cat,
      [
        areaRow({ id: 'a1', slug: 'copy', coverUrl: 'https://exemplo.test/capa-da-linha-ignorada.png' }),
        areaRow({ id: 'a9', name: 'Design', slug: 'design', coverUrl: 'https://exemplo.test/capa-da-area-vazia.png' }),
      ],
      'tudo',
    )
    expect(fileiras.find((f) => f.areaSlug === 'copy')?.areaCoverUrl).toBe('https://exemplo.test/capa-do-grupo.png')
    expect(fileiras.find((f) => f.areaSlug === 'design')?.areaCoverUrl).toBe('https://exemplo.test/capa-da-area-vazia.png')
  })
  it('grupo sem slug (o "Outros") não vira fileira', () => {
    expect(montarFileiras(catalogo([grupo({ areaSlug: null })]), [], 'tudo')).toEqual([])
  })
  it('com filtro, fileira que esvazia some — inclusive as de área sem curso', () => {
    const cat = catalogo([
      grupo({ groupKey: 'a1', areaSlug: 'copy', items: [item({ id: 'c1', progress: p(1, 3) })] }),
      grupo({ groupKey: 'a2', areaSlug: 'trafego', items: [item({ id: 'c2', progress: p(0, 3) })] }),
    ])
    const fileiras = montarFileiras(cat, [areaRow({ id: 'a9', slug: 'design' })], 'continuar')
    expect(fileiras.map((f) => f.areaSlug)).toEqual(['copy'])
  })
  // Review Focus 3.
  it('nada passa no filtro → nenhuma fileira', () => {
    const cat = catalogo([grupo({ items: [item({ progress: p(0, 3) })] })])
    expect(montarFileiras(cat, [], 'concluidos')).toEqual([])
  })
})

// Revisão final, Important #1: antes desta correção a trilha só aparecia
// como destaque do banner — concluída, ela não tinha área própria para
// entrar numa FileiraArea, e sumia da home por completo (só alcançável
// digitando /curso/<slug> na mão). linhaDaTrilha é o que devolve o caminho.
describe('linhaDaTrilha', () => {
  const p = (completed: number, total: number) => ({ completed, total, percent: total ? Math.round((completed / total) * 100) : 0 })

  it('sem trilha no catálogo → nenhuma fileira', () => {
    expect(linhaDaTrilha(null, { tipo: 'nenhum' }, 'tudo')).toBeNull()
  })

  it('trilha ainda é o destaque (pendente) → não duplica na fileira', () => {
    const onboarding = item({ isOnboarding: true, access: 'view', progress: p(1, 4) })
    const destaque = escolherDestaque(onboarding, false)
    expect(destaque.tipo).toBe('trilha')
    expect(linhaDaTrilha(onboarding, destaque, 'tudo')).toBeNull()
  })

  it('trilha concluída continua acessível e aparece em Concluídos', () => {
    const onboarding = item({
      id: 'trilha-1',
      slug: 'trilha-inicial',
      isOnboarding: true,
      access: 'view',
      progress: p(4, 4),
    })
    // Concluída: já não é mais o destaque do banner.
    const destaque = escolherDestaque(onboarding, false)
    expect(destaque).toEqual({ tipo: 'nenhum' })

    const fileira = linhaDaTrilha(onboarding, destaque, 'concluidos')
    expect(fileira).toEqual({
      key: 'trilha-inicial',
      areaName: 'Trilha inicial',
      areaSlug: null,
      areaCoverUrl: null,
      items: [onboarding],
    })
  })

  it('trilha concluída não aparece em "Não iniciados" nem "Continuar"', () => {
    const onboarding = item({ isOnboarding: true, access: 'view', progress: p(4, 4) })
    const destaque = escolherDestaque(onboarding, false)
    expect(linhaDaTrilha(onboarding, destaque, 'nao-iniciados')).toBeNull()
    expect(linhaDaTrilha(onboarding, destaque, 'continuar')).toBeNull()
  })

  it('trilha concluída aparece em "Tudo"', () => {
    const onboarding = item({ isOnboarding: true, access: 'view', progress: p(4, 4) })
    const destaque = escolherDestaque(onboarding, false)
    expect(linhaDaTrilha(onboarding, destaque, 'tudo')?.items).toEqual([onboarding])
  })
})
