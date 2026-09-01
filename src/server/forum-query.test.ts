import { describe, expect, it } from 'vitest'
import {
  destinatariosDaDuvida,
  paraForumQuestion,
  paraPendingQuestion,
  pertenceAFilaDoLider,
  podeGerenciarArea,
  type LinhaFilaDuvidas,
  type LinhaPergunta,
  type PerfilAutor,
} from './forum-query'

const AREA_TRAFEGO = 'area-trafego'
const AREA_DESIGN = 'area-design'

describe('podeGerenciarArea — a mesma decisão por trás do selo "Professor" e da moderação', () => {
  it('admin gerencia qualquer área, mesmo sem área própria', () => {
    expect(podeGerenciarArea({ role: 'admin', areaId: null }, AREA_TRAFEGO)).toBe(true)
    expect(podeGerenciarArea({ role: 'admin', areaId: AREA_DESIGN }, AREA_TRAFEGO)).toBe(true)
  })

  it('líder DESTA área gerencia', () => {
    expect(podeGerenciarArea({ role: 'leader', areaId: AREA_TRAFEGO }, AREA_TRAFEGO)).toBe(true)
  })

  it('líder de OUTRA área não gerencia — mesmo tendo acesso individual liberado à aula', () => {
    // "Acesso individual" (course_access) é uma pergunta de canAccessCourse
    // (nível 'view'), que esta função nem recebe como parâmetro — só
    // role/areaId da pessoa e a área do curso. Um líder de Design com uma
    // liberação avulsa num curso de Tráfego não vira "professor" desse
    // curso nem consegue moderar o fórum dele.
    expect(podeGerenciarArea({ role: 'leader', areaId: AREA_DESIGN }, AREA_TRAFEGO)).toBe(false)
  })

  it('colega comum (member) nunca gerencia, nem na própria área', () => {
    expect(podeGerenciarArea({ role: 'member', areaId: AREA_TRAFEGO }, AREA_TRAFEGO)).toBe(false)
  })

  it('líder sem área própria (areaId null) não gerencia nada', () => {
    expect(podeGerenciarArea({ role: 'leader', areaId: null }, AREA_TRAFEGO)).toBe(false)
  })

  it('curso sem área (trilha inicial, area_id null): nem líder nem colega "batem" — só admin gerencia', () => {
    expect(podeGerenciarArea({ role: 'leader', areaId: null }, null)).toBe(false)
    expect(podeGerenciarArea({ role: 'admin', areaId: null }, null)).toBe(true)
  })
})

function linha(over: Partial<LinhaPergunta> = {}): LinhaPergunta {
  return {
    id: 'q1',
    body: 'Como funciona X?',
    is_pinned: false,
    resolved_at: null,
    created_at: '2026-08-31T10:00:00Z',
    author_id: 'colega-1',
    answers: [],
    ...over,
  }
}

function perfis(entradas: Record<string, PerfilAutor>): Map<string, PerfilAutor> {
  return new Map(Object.entries(entradas))
}

const COLEGA_1: PerfilAutor = { full_name: 'Colega Um', role: 'member', area_id: AREA_TRAFEGO, status: 'active' }

describe('paraForumQuestion — selo, canDelete e canModerate a partir de uma linha do banco', () => {
  it('autor admin ganha o selo "Professor", mesmo fora da área do curso', () => {
    const pergunta = paraForumQuestion(
      linha({ author_id: 'admin-1' }),
      'outra-pessoa',
      false,
      AREA_TRAFEGO,
      perfis({ 'admin-1': { full_name: 'Admin', role: 'admin', area_id: null, status: 'active' } }),
    )
    expect(pergunta.author.isInstructor).toBe(true)
  })

  it('autor líder DESTA área ganha o selo', () => {
    const pergunta = paraForumQuestion(
      linha({ author_id: 'lider-t' }),
      'outra-pessoa',
      false,
      AREA_TRAFEGO,
      perfis({ 'lider-t': { full_name: 'Líder Tráfego', role: 'leader', area_id: AREA_TRAFEGO, status: 'active' } }),
    )
    expect(pergunta.author.isInstructor).toBe(true)
  })

  it('autor líder de OUTRA área não ganha o selo neste curso', () => {
    const pergunta = paraForumQuestion(
      linha({ author_id: 'lider-d' }),
      'outra-pessoa',
      false,
      AREA_TRAFEGO,
      perfis({ 'lider-d': { full_name: 'Líder Design', role: 'leader', area_id: AREA_DESIGN, status: 'active' } }),
    )
    expect(pergunta.author.isInstructor).toBe(false)
  })

  it('autor colega comum nunca ganha o selo', () => {
    const pergunta = paraForumQuestion(linha(), 'outra-pessoa', false, AREA_TRAFEGO, perfis({ 'colega-1': COLEGA_1 }))
    expect(pergunta.author.isInstructor).toBe(false)
  })

  it('líder DESTA área, mas DESATIVADO: perde o selo — autoridade é do estado atual, não do que era quando publicou', () => {
    const pergunta = paraForumQuestion(
      linha({ author_id: 'lider-t-inativo' }),
      'outra-pessoa',
      false,
      AREA_TRAFEGO,
      perfis({
        'lider-t-inativo': { full_name: 'Ex-líder Tráfego', role: 'leader', area_id: AREA_TRAFEGO, status: 'inactive' },
      }),
    )
    expect(pergunta.author.isInstructor).toBe(false)
    // Controle: o mesmo perfil, ativo, ganharia o selo — a diferença é só o status.
    const ativo = paraForumQuestion(
      linha({ author_id: 'lider-t-ativo' }),
      'outra-pessoa',
      false,
      AREA_TRAFEGO,
      perfis({
        'lider-t-ativo': { full_name: 'Líder Tráfego', role: 'leader', area_id: AREA_TRAFEGO, status: 'active' },
      }),
    )
    expect(ativo.author.isInstructor).toBe(true)
  })

  it('perfil ausente do Map (não deveria acontecer — cascade delete): nome de reserva, sem selo', () => {
    const pergunta = paraForumQuestion(linha(), 'outra-pessoa', false, AREA_TRAFEGO, perfis({}))
    expect(pergunta.author.name).toBe('Colaborador')
    expect(pergunta.author.isInstructor).toBe(false)
  })

  it('canDelete é true só para quem fez a pergunta', () => {
    const p = perfis({ 'colega-1': COLEGA_1 })
    expect(paraForumQuestion(linha(), 'colega-1', false, AREA_TRAFEGO, p).canDelete).toBe(true)
    expect(paraForumQuestion(linha(), 'outra-pessoa', false, AREA_TRAFEGO, p).canDelete).toBe(false)
  })

  it('canModerate reflete o parâmetro recebido, igual para toda pergunta da lista', () => {
    const p = perfis({ 'colega-1': COLEGA_1 })
    expect(paraForumQuestion(linha(), 'outra-pessoa', true, AREA_TRAFEGO, p).canModerate).toBe(true)
    expect(paraForumQuestion(linha(), 'outra-pessoa', false, AREA_TRAFEGO, p).canModerate).toBe(false)
  })

  it('resolved reflete resolved_at ser nulo ou não', () => {
    const p = perfis({ 'colega-1': COLEGA_1 })
    expect(paraForumQuestion(linha(), 'x', false, AREA_TRAFEGO, p).resolved).toBe(false)
    expect(
      paraForumQuestion(linha({ resolved_at: '2026-08-31T11:00:00Z' }), 'x', false, AREA_TRAFEGO, p).resolved,
    ).toBe(true)
  })

  it('respostas: ordenadas por created_at, não pela ordem de chegada da linha', () => {
    const p = perfis({
      'colega-1': COLEGA_1,
      x: { full_name: 'X', role: 'member', area_id: AREA_TRAFEGO, status: 'active' },
      y: { full_name: 'Y', role: 'member', area_id: AREA_TRAFEGO, status: 'active' },
    })
    const pergunta = paraForumQuestion(
      linha({
        answers: [
          { id: 'a2', body: 'Segunda resposta', created_at: '2026-08-31T12:00:00Z', author_id: 'x' },
          { id: 'a1', body: 'Primeira resposta', created_at: '2026-08-31T11:00:00Z', author_id: 'y' },
        ],
      }),
      'z',
      false,
      AREA_TRAFEGO,
      p,
    )
    expect(pergunta.answers.map((a) => a.id)).toEqual(['a1', 'a2'])
  })

  it('canDelete de uma resposta: verdadeiro para o autor OU para quem modera, nunca para um terceiro', () => {
    const respostaDe = (autorId: string) => ({
      id: 'a1',
      body: 'Resp',
      created_at: '2026-08-31T11:00:00Z',
      author_id: autorId,
    })
    const p = perfis({
      'colega-1': COLEGA_1,
      'resp-1': { full_name: 'Alguém', role: 'member', area_id: AREA_TRAFEGO, status: 'active' },
    })

    const comoAutor = paraForumQuestion(linha({ answers: [respostaDe('resp-1')] }), 'resp-1', false, AREA_TRAFEGO, p)
    expect(comoAutor.answers[0]!.canDelete).toBe(true)

    const comoModerador = paraForumQuestion(
      linha({ answers: [respostaDe('resp-1')] }),
      'outra-pessoa',
      true,
      AREA_TRAFEGO,
      p,
    )
    expect(comoModerador.answers[0]!.canDelete).toBe(true)

    const comoTerceiro = paraForumQuestion(
      linha({ answers: [respostaDe('resp-1')] }),
      'outra-pessoa',
      false,
      AREA_TRAFEGO,
      p,
    )
    expect(comoTerceiro.answers[0]!.canDelete).toBe(false)
  })
})

describe('destinatariosDaDuvida — quem recebe o e-mail de uma dúvida nova ou de uma resposta', () => {
  it('o autor nunca recebe o próprio texto de volta', () => {
    const candidatos = [{ id: 'autor-1', email: 'autor@gexcorp.com.br' }]
    expect(destinatariosDaDuvida(candidatos, 'autor-1')).toEqual([])
  })

  it('um candidato com o MESMO e-mail do autor mas id diferente ainda recebe — a exclusão é por id, não por e-mail', () => {
    // Guarda contra a implementação errada: comparar por e-mail excluiria
    // este candidato só porque o texto do e-mail bate, mesmo sendo outra
    // pessoa (e-mail é o campo mais mutável do perfil).
    const candidatos = [{ id: 'lider-1', email: 'mesmo@gexcorp.com.br' }]
    expect(destinatariosDaDuvida(candidatos, 'autor-1')).toEqual(['mesmo@gexcorp.com.br'])
  })

  it('lista de candidatos vazia devolve vazio', () => {
    expect(destinatariosDaDuvida([], 'autor-1')).toEqual([])
  })

  it('mistura: só o autor fica de fora, os demais candidatos permanecem', () => {
    const candidatos = [
      { id: 'autor-1', email: 'autor@gexcorp.com.br' },
      { id: 'lider-1', email: 'lider@gexcorp.com.br' },
      { id: 'lider-2', email: 'lider2@gexcorp.com.br' },
    ]
    expect(destinatariosDaDuvida(candidatos, 'autor-1')).toEqual(['lider@gexcorp.com.br', 'lider2@gexcorp.com.br'])
  })

  it('caso de answerQuestion: candidato único (autor da pergunta), excluído quando é a própria pessoa respondendo', () => {
    const autorDaPergunta = [{ id: 'pessoa-1', email: 'pessoa@gexcorp.com.br' }]
    // Alguém complementando a própria pergunta: não recebe e-mail dela mesma.
    expect(destinatariosDaDuvida(autorDaPergunta, 'pessoa-1')).toEqual([])
    // Outra pessoa respondendo: o autor da pergunta recebe.
    expect(destinatariosDaDuvida(autorDaPergunta, 'outra-pessoa')).toEqual(['pessoa@gexcorp.com.br'])
  })
})

describe('pertenceAFilaDoLider — defesa em profundidade da fila de dúvidas do líder', () => {
  it('líder de uma área não vê a fila de outra área', () => {
    expect(pertenceAFilaDoLider({ role: 'leader', areaId: AREA_TRAFEGO }, AREA_DESIGN)).toBe(false)
  })

  it('líder vê a fila da própria área', () => {
    expect(pertenceAFilaDoLider({ role: 'leader', areaId: AREA_TRAFEGO }, AREA_TRAFEGO)).toBe(true)
  })

  it('admin vê a fila de todas as áreas, mesmo sem área própria', () => {
    expect(pertenceAFilaDoLider({ role: 'admin', areaId: null }, AREA_TRAFEGO)).toBe(true)
    expect(pertenceAFilaDoLider({ role: 'admin', areaId: AREA_DESIGN }, AREA_TRAFEGO)).toBe(true)
  })

  it('líder sem área própria (areaId null) não vê fila de curso com área', () => {
    expect(pertenceAFilaDoLider({ role: 'leader', areaId: null }, AREA_TRAFEGO)).toBe(false)
  })

  it('líder sem área própria (areaId null) não vê a fila de um curso TAMBÉM sem área (trilha de onboarding) — null não é uma área que bate com null', () => {
    expect(pertenceAFilaDoLider({ role: 'leader', areaId: null }, null)).toBe(false)
  })

  it('admin vê a fila de um curso sem área (trilha de onboarding)', () => {
    expect(pertenceAFilaDoLider({ role: 'admin', areaId: null }, null)).toBe(true)
  })

  it('colega comum (member) nunca vê a fila, mesmo com áreas batendo', () => {
    expect(pertenceAFilaDoLider({ role: 'member', areaId: AREA_TRAFEGO }, AREA_TRAFEGO)).toBe(false)
  })
})

function linhaFila(over: Partial<LinhaFilaDuvidas> = {}): LinhaFilaDuvidas {
  return {
    id: 'q1',
    body: 'Como funciona X?',
    created_at: '2026-08-31T10:00:00Z',
    author_id: 'colega-1',
    answers: [],
    lessons: {
      title: 'Aula 1',
      slug: 'aula-1',
      courses: { title: 'Curso Tráfego', slug: 'curso-trafego', area_id: AREA_TRAFEGO },
    },
    ...over,
  }
}

describe('paraPendingQuestion — mapeamento de linha crua para a fila do líder', () => {
  it('nome do autor vem do Map de perfis', () => {
    const pendente = paraPendingQuestion(linhaFila({ author_id: 'colega-1' }), perfis({ 'colega-1': COLEGA_1 }))
    expect(pendente.authorName).toBe('Colega Um')
  })

  it('autor ausente do Map cai no nome de reserva "Colaborador" — é o caso do aluno de outra área, liberado ao curso mas sem política de leitura sobre profiles', () => {
    const pendente = paraPendingQuestion(linhaFila({ author_id: 'colega-de-fora' }), perfis({}))
    expect(pendente.authorName).toBe('Colaborador')
  })

  it('demais campos vêm da aula/curso aninhados e da contagem de respostas', () => {
    const pendente = paraPendingQuestion(
      linhaFila({
        id: 'q9',
        body: 'Dúvida sobre o módulo 2',
        answers: [{ id: 'a1' }],
      }),
      perfis({ 'colega-1': COLEGA_1 }),
    )
    expect(pendente).toMatchObject({
      id: 'q9',
      body: 'Dúvida sobre o módulo 2',
      answerCount: 1,
      lessonTitle: 'Aula 1',
      lessonSlug: 'aula-1',
      courseTitle: 'Curso Tráfego',
      courseSlug: 'curso-trafego',
    })
  })
})
