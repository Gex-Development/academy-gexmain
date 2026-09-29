import { describe, expect, it } from 'vitest'
import type { AreaRow } from './areas'
import type { Catalog, CatalogItem } from './catalog-query'
import {
  capaComReserva,
  dadosDaArea,
  escolherDestaque,
  itemDoCatalogo,
  lerFiltro,
  montarFileiras,
  passaNoFiltro,
  selecionarEmAndamento,
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
})

describe('selecionarEmAndamento', () => {
  it('curso nunca começado fica fora', () => {
    const nunca = item({ progress: { completed: 0, total: 4, percent: 0 } })
    expect(selecionarEmAndamento([nunca])).toEqual([])
  })

  it('curso concluído fica fora', () => {
    const concluido = item({ progress: { completed: 4, total: 4, percent: 100 } })
    expect(selecionarEmAndamento([concluido])).toEqual([])
  })

  it('curso com progresso mas access none fica fora — a pessoa perdeu o acesso depois de começar', () => {
    const semAcesso = item({ access: 'none', progress: { completed: 2, total: 4, percent: 50 } })
    expect(selecionarEmAndamento([semAcesso])).toEqual([])
  })

  it('curso começado e inacabado entra', () => {
    const emAndamento = item({ progress: { completed: 2, total: 4, percent: 50 } })
    expect(selecionarEmAndamento([emAndamento])).toEqual([emAndamento])
  })

  it('199 de 200 aulas entra — percent arredonda para 100, completed/total não', () => {
    // Math.round((199 / 200) * 100) === 100: se o filtro usasse percent < 100
    // esse curso, inacabado, sumiria da fileira. Ver progressPercent em
    // src/lib/progress/percent.ts.
    const quaseNoFim = item({ progress: { completed: 199, total: 200, percent: 100 } })
    expect(selecionarEmAndamento([quaseNoFim])).toEqual([quaseNoFim])
  })

  it('preserva a ordem de entrada — é filtro, não reordenação', () => {
    const a = item({ id: 'a', progress: { completed: 1, total: 4, percent: 25 } })
    const b = item({ id: 'b', progress: { completed: 2, total: 4, percent: 50 } })
    const c = item({ id: 'c', progress: { completed: 3, total: 4, percent: 75 } })

    expect(selecionarEmAndamento([c, a, b]).map((i) => i.id)).toEqual(['c', 'a', 'b'])
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
  it('área sem curso entra no fim, vazia (o card "Em breve")', () => {
    const cat = catalogo([grupo({ groupKey: 'a1', areaSlug: 'copy', items: [item()] })])
    const fileiras = montarFileiras(cat, [areaRow({ id: 'a1', slug: 'copy' }), areaRow({ id: 'a9', name: 'Design', slug: 'design' })], 'tudo')
    expect(fileiras.map((f) => [f.areaSlug, f.items.length])).toEqual([['copy', 1], ['design', 0]])
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
