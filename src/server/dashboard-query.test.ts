import { describe, expect, it } from 'vitest'
import {
  montarPainel,
  visivelParaGestor,
  type LinhaCursoPainel,
  type LinhaLiberacaoPainel,
  type LinhaPerfilPainel,
  type LinhaProgressoPainel,
} from './dashboard-query'

const AREA_TRAFEGO = 'area-trafego'
const AREA_DESIGN = 'area-design'

function perfil(over: Partial<LinhaPerfilPainel> = {}): LinhaPerfilPainel {
  return {
    id: 'pessoa-1',
    full_name: 'Pessoa Um',
    role: 'member',
    area_id: AREA_TRAFEGO,
    status: 'active',
    areas: { name: 'Tráfego' },
    ...over,
  }
}

function curso(over: Partial<LinhaCursoPainel> = {}): LinhaCursoPainel {
  return {
    id: 'curso-1',
    title: 'Curso Um',
    area_id: AREA_TRAFEGO,
    status: 'published',
    is_onboarding: false,
    areas: { name: 'Tráfego' },
    lessons: [
      { id: 'aula-1', status: 'published' },
      { id: 'aula-2', status: 'published' },
    ],
    ...over,
  }
}

describe('visivelParaGestor — a mesma decisão de área do painel', () => {
  it('admin enxerga qualquer área, mesmo sem área própria', () => {
    expect(visivelParaGestor({ role: 'admin', areaId: null }, AREA_TRAFEGO)).toBe(true)
    expect(visivelParaGestor({ role: 'admin', areaId: AREA_DESIGN }, AREA_TRAFEGO)).toBe(true)
  })

  it('líder DESTA área enxerga', () => {
    expect(visivelParaGestor({ role: 'leader', areaId: AREA_TRAFEGO }, AREA_TRAFEGO)).toBe(true)
  })

  it('líder de OUTRA área não enxerga', () => {
    expect(visivelParaGestor({ role: 'leader', areaId: AREA_DESIGN }, AREA_TRAFEGO)).toBe(false)
  })

  it('líder SEM área própria (areaId null) não enxerga nem uma linha também sem área — a correção central', () => {
    // Sem o `atual.areaId !== null`, `null === null` casaria com toda
    // pessoa/curso sem área, e a trilha de onboarding é justamente um
    // curso sem área.
    expect(visivelParaGestor({ role: 'leader', areaId: null }, null)).toBe(false)
    expect(visivelParaGestor({ role: 'leader', areaId: null }, AREA_TRAFEGO)).toBe(false)
  })

  it('member nunca enxerga, nem na própria área', () => {
    expect(visivelParaGestor({ role: 'member', areaId: AREA_TRAFEGO }, AREA_TRAFEGO)).toBe(false)
  })
})

describe('montarPainel — filtro por área', () => {
  it('líder não vê pessoas nem cursos de outra área', () => {
    const atual = { role: 'leader', areaId: AREA_TRAFEGO }
    const perfis = [
      perfil({ id: 'p-trafego', full_name: 'Pessoa Tráfego', area_id: AREA_TRAFEGO }),
      perfil({ id: 'p-design', full_name: 'Pessoa Design', area_id: AREA_DESIGN, areas: { name: 'Design' } }),
    ]
    const cursos = [
      curso({ id: 'c-trafego', title: 'Curso Tráfego', area_id: AREA_TRAFEGO }),
      curso({ id: 'c-design', title: 'Curso Design', area_id: AREA_DESIGN, areas: { name: 'Design' } }),
    ]

    const { pessoas, cursos: cursosStats } = montarPainel(atual, perfis, cursos, [], [])

    expect(pessoas.map((p) => p.userId)).toEqual(['p-trafego'])
    expect(cursosStats.map((c) => c.courseId)).toEqual(['c-trafego'])
  })

  it('líder SEM área não vê ninguém nem curso algum — é o teste que prova que a correção pegou', () => {
    const atual = { role: 'leader', areaId: null }
    const perfis = [
      perfil({ id: 'p-trafego', area_id: AREA_TRAFEGO }),
      perfil({ id: 'p-sem-area', full_name: 'Pessoa Sem Área', area_id: null, areas: null }),
    ]
    const cursos = [
      curso({ id: 'c-trafego', area_id: AREA_TRAFEGO }),
      // Curso sem área, mas NÃO onboarding — prova que o bug não é
      // específico da trilha inicial, é qualquer linha com area_id null.
      curso({ id: 'c-sem-area', title: 'Curso Órfão', area_id: null, areas: null }),
    ]

    const { pessoas, cursos: cursosStats } = montarPainel(atual, perfis, cursos, [], [])

    expect(pessoas).toEqual([])
    expect(cursosStats).toEqual([])
  })

  it('admin vê todas as pessoas e todos os cursos publicados (rascunho fica de fora mesmo para admin)', () => {
    const atual = { role: 'admin', areaId: null }
    const perfis = [
      perfil({ id: 'p-trafego', area_id: AREA_TRAFEGO }),
      perfil({ id: 'p-design', full_name: 'Pessoa Design', area_id: AREA_DESIGN, areas: { name: 'Design' } }),
    ]
    const cursos = [
      curso({ id: 'c-trafego', area_id: AREA_TRAFEGO }),
      curso({ id: 'c-design', title: 'Curso Design', area_id: AREA_DESIGN, areas: { name: 'Design' } }),
      curso({ id: 'c-rascunho', title: 'Curso Rascunho', status: 'draft' }),
    ]

    const { pessoas, cursos: cursosStats } = montarPainel(atual, perfis, cursos, [], [])

    expect(pessoas.map((p) => p.userId).sort()).toEqual(['p-design', 'p-trafego'])
    expect(cursosStats.map((c) => c.courseId).sort()).toEqual(['c-design', 'c-trafego'])
  })
})

describe('montarPainel — onboardingConcluido', () => {
  const trilha = curso({
    id: 'onboarding',
    title: 'Trilha inicial',
    area_id: null,
    is_onboarding: true,
    lessons: [
      { id: 'o1', status: 'published' },
      { id: 'o2', status: 'published' },
    ],
  })

  it('verdadeiro só quando TODAS as aulas publicadas da trilha estão concluídas', () => {
    const atual = { role: 'admin', areaId: null }
    const perfis = [perfil({ id: 'p1' })]
    const progresso: LinhaProgressoPainel[] = [
      { user_id: 'p1', lesson_id: 'o1' },
      { user_id: 'p1', lesson_id: 'o2' },
    ]

    const { pessoas } = montarPainel(atual, perfis, [trilha], [], progresso)

    expect(pessoas[0].onboardingConcluido).toBe(true)
  })

  it('falso quando falta concluir uma aula da trilha', () => {
    const atual = { role: 'admin', areaId: null }
    const perfis = [perfil({ id: 'p1' })]
    const progresso: LinhaProgressoPainel[] = [{ user_id: 'p1', lesson_id: 'o1' }]

    const { pessoas } = montarPainel(atual, perfis, [trilha], [], progresso)

    expect(pessoas[0].onboardingConcluido).toBe(false)
  })

  it('falso quando a pessoa não concluiu nenhuma aula da trilha', () => {
    const atual = { role: 'admin', areaId: null }
    const perfis = [perfil({ id: 'p1' })]

    const { pessoas } = montarPainel(atual, perfis, [trilha], [], [])

    expect(pessoas[0].onboardingConcluido).toBe(false)
  })
})

describe('montarPainel — liberação avulsa conta em "disponíveis"', () => {
  it('aulas de um curso de outra área, liberado individualmente, entram em disponiveis', () => {
    const atual = { role: 'leader', areaId: AREA_TRAFEGO }
    const perfis = [perfil({ id: 'p1', area_id: AREA_TRAFEGO })]
    const cursoProprio = curso({ id: 'c-trafego', area_id: AREA_TRAFEGO, lessons: [{ id: 'a1', status: 'published' }] })
    const cursoDeFora = curso({
      id: 'c-design',
      title: 'Curso Design',
      area_id: AREA_DESIGN,
      areas: { name: 'Design' },
      lessons: [{ id: 'a2', status: 'published' }],
    })
    const liberacoes: LinhaLiberacaoPainel[] = [{ user_id: 'p1', course_id: 'c-design' }]

    const { pessoas } = montarPainel(atual, perfis, [cursoProprio, cursoDeFora], liberacoes, [])

    // 1 aula do curso da própria área + 1 aula do curso de fora liberado
    // individualmente — mesmo o curso de fora não aparecendo na lista "por
    // curso" deste líder (visivelParaGestor barra pela área).
    expect(pessoas[0].disponiveis).toBe(2)
  })
})

describe('montarPainel — curso sem aula publicada', () => {
  it('não divide por zero e reporta concluiram: 0, mesmo com gente tendo acesso', () => {
    const atual = { role: 'admin', areaId: null }
    const perfis = [perfil({ id: 'p1', area_id: AREA_TRAFEGO })]
    const cursoVazio = curso({ id: 'c-vazio', title: 'Curso Vazio', area_id: AREA_TRAFEGO, lessons: [] })

    const { cursos: cursosStats } = montarPainel(atual, perfis, [cursoVazio], [], [])

    expect(cursosStats).toEqual([
      expect.objectContaining({ courseId: 'c-vazio', comAcesso: 1, concluiram: 0, percent: 0 }),
    ])
  })
})

describe('montarPainel — status vem da linha, não cravado (Correção 2)', () => {
  it('pessoa com status diferente de active fica com zero aulas disponíveis, mesmo tendo um curso "próprio" da área — e sai da lista (Item 11)', () => {
    // getDashboard filtra `.eq('status', 'active')` na consulta real, mas a
    // função pura não deve depender disso: se `status` fosse cravado como
    // 'active' aqui dentro, canAccessCourse devolveria 'view' para o curso
    // da própria área (member, mesma área) e a pessoa apareceria na lista
    // com aulas disponíveis — em vez de ficar de fora por ter zero.
    const atual = { role: 'admin', areaId: null }
    const perfis = [perfil({ id: 'p1', area_id: AREA_TRAFEGO, status: 'inactive' })]
    const cursoProprio = curso({ id: 'c1', area_id: AREA_TRAFEGO })

    const { pessoas } = montarPainel(atual, perfis, [cursoProprio], [], [])

    expect(pessoas).toEqual([])
  })
})

describe('montarPainel — Item 11: "disponíveis" só conta curso acessado COMO ALUNO, nunca como gestor', () => {
  it('líder que gerencia um curso da própria área não soma essas aulas em disponíveis — canAccessCourse devolve "manage", não "view"', () => {
    const atual = { role: 'leader', areaId: AREA_TRAFEGO }
    const perfis = [perfil({ id: 'lider-1', full_name: 'Líder Tráfego', role: 'leader', area_id: AREA_TRAFEGO })]
    const cursoGerenciado = curso({ id: 'c-trafego', area_id: AREA_TRAFEGO, lessons: [{ id: 'a1', status: 'published' }] })

    const { pessoas } = montarPainel(atual, perfis, [cursoGerenciado], [], [])

    // Zero aulas disponíveis (o único curso que ele toca, ele gerencia) —
    // não há nada a relatar sobre esta pessoa, então ela sai da lista.
    expect(pessoas).toEqual([])
  })

  it('líder continua na lista pela trilha inicial e por um curso de OUTRA área que ele só acessa (nunca gerencia nenhum dos dois)', () => {
    const atual = { role: 'leader', areaId: AREA_TRAFEGO }
    const perfis = [perfil({ id: 'lider-1', full_name: 'Líder Tráfego', role: 'leader', area_id: AREA_TRAFEGO })]
    const trilha = curso({
      id: 'onboarding',
      title: 'Trilha inicial',
      area_id: null,
      is_onboarding: true,
      lessons: [{ id: 'o1', status: 'published' }],
    })
    const cursoDeFora = curso({
      id: 'c-design',
      title: 'Curso Design',
      area_id: AREA_DESIGN,
      areas: { name: 'Design' },
      lessons: [{ id: 'a2', status: 'published' }],
    })
    const liberacoes: LinhaLiberacaoPainel[] = [{ user_id: 'lider-1', course_id: 'c-design' }]

    const { pessoas } = montarPainel(atual, perfis, [trilha, cursoDeFora], liberacoes, [])

    // 1 aula da trilha (todo ativo acessa como aluno) + 1 aula do curso de
    // Design liberado individualmente (ele não gerencia Design) = 2.
    expect(pessoas).toHaveLength(1)
    expect(pessoas[0].disponiveis).toBe(2)
  })

  it('admin não aparece na lista "Por pessoa": gerencia todo curso publicado (e até rascunho), nunca tem aula "view"', () => {
    const atual = { role: 'admin', areaId: null }
    const perfis = [perfil({ id: 'admin-1', full_name: 'Admin', role: 'admin', area_id: null, areas: null })]
    const cursos = [
      curso({ id: 'c-trafego', area_id: AREA_TRAFEGO }),
      curso({ id: 'c-design', title: 'Curso Design', area_id: AREA_DESIGN, areas: { name: 'Design' } }),
    ]

    const { pessoas } = montarPainel(atual, perfis, cursos, [], [])

    expect(pessoas).toEqual([])
  })
})
