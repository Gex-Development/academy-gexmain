import { describe, expect, it } from 'vitest'
import { paraForumQuestion, podeGerenciarArea, type LinhaPergunta } from './forum-query'

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
    profiles: { full_name: 'Colega Um', role: 'member', area_id: AREA_TRAFEGO },
    answers: [],
    ...over,
  }
}

describe('paraForumQuestion — selo, canEdit e canModerate a partir de uma linha do banco', () => {
  it('autor admin ganha o selo "Professor", mesmo fora da área do curso', () => {
    const pergunta = paraForumQuestion(
      linha({ profiles: { full_name: 'Admin', role: 'admin', area_id: null } }),
      'outra-pessoa',
      false,
      AREA_TRAFEGO,
    )
    expect(pergunta.author.isInstructor).toBe(true)
  })

  it('autor líder DESTA área ganha o selo', () => {
    const pergunta = paraForumQuestion(
      linha({ profiles: { full_name: 'Líder Tráfego', role: 'leader', area_id: AREA_TRAFEGO } }),
      'outra-pessoa',
      false,
      AREA_TRAFEGO,
    )
    expect(pergunta.author.isInstructor).toBe(true)
  })

  it('autor líder de OUTRA área não ganha o selo neste curso', () => {
    const pergunta = paraForumQuestion(
      linha({ profiles: { full_name: 'Líder Design', role: 'leader', area_id: AREA_DESIGN } }),
      'outra-pessoa',
      false,
      AREA_TRAFEGO,
    )
    expect(pergunta.author.isInstructor).toBe(false)
  })

  it('autor colega comum nunca ganha o selo', () => {
    const pergunta = paraForumQuestion(linha(), 'outra-pessoa', false, AREA_TRAFEGO)
    expect(pergunta.author.isInstructor).toBe(false)
  })

  it('perfil ausente (autor removido): nome de reserva, sem selo', () => {
    const pergunta = paraForumQuestion(linha({ profiles: null }), 'outra-pessoa', false, AREA_TRAFEGO)
    expect(pergunta.author.name).toBe('Colaborador')
    expect(pergunta.author.isInstructor).toBe(false)
  })

  it('canEdit é true só para quem fez a pergunta', () => {
    expect(paraForumQuestion(linha(), 'colega-1', false, AREA_TRAFEGO).canEdit).toBe(true)
    expect(paraForumQuestion(linha(), 'outra-pessoa', false, AREA_TRAFEGO).canEdit).toBe(false)
  })

  it('canModerate reflete o parâmetro recebido, igual para toda pergunta da lista', () => {
    expect(paraForumQuestion(linha(), 'outra-pessoa', true, AREA_TRAFEGO).canModerate).toBe(true)
    expect(paraForumQuestion(linha(), 'outra-pessoa', false, AREA_TRAFEGO).canModerate).toBe(false)
  })

  it('resolved reflete resolved_at ser nulo ou não', () => {
    expect(paraForumQuestion(linha(), 'x', false, AREA_TRAFEGO).resolved).toBe(false)
    expect(paraForumQuestion(linha({ resolved_at: '2026-08-31T11:00:00Z' }), 'x', false, AREA_TRAFEGO).resolved).toBe(
      true,
    )
  })

  it('respostas: ordenadas por created_at, não pela ordem de chegada da linha', () => {
    const pergunta = paraForumQuestion(
      linha({
        answers: [
          {
            id: 'a2',
            body: 'Segunda resposta',
            created_at: '2026-08-31T12:00:00Z',
            author_id: 'x',
            profiles: { full_name: 'X', role: 'member', area_id: AREA_TRAFEGO },
          },
          {
            id: 'a1',
            body: 'Primeira resposta',
            created_at: '2026-08-31T11:00:00Z',
            author_id: 'y',
            profiles: { full_name: 'Y', role: 'member', area_id: AREA_TRAFEGO },
          },
        ],
      }),
      'z',
      false,
      AREA_TRAFEGO,
    )
    expect(pergunta.answers.map((a) => a.id)).toEqual(['a1', 'a2'])
  })

  it('canEdit de uma resposta: verdadeiro para o autor OU para quem modera, nunca para um terceiro', () => {
    const respostaDe = (autorId: string) => ({
      id: 'a1',
      body: 'Resp',
      created_at: '2026-08-31T11:00:00Z',
      author_id: autorId,
      profiles: { full_name: 'Alguém', role: 'member' as const, area_id: AREA_TRAFEGO },
    })

    const comoAutor = paraForumQuestion(linha({ answers: [respostaDe('resp-1')] }), 'resp-1', false, AREA_TRAFEGO)
    expect(comoAutor.answers[0]!.canEdit).toBe(true)

    const comoModerador = paraForumQuestion(
      linha({ answers: [respostaDe('resp-1')] }),
      'outra-pessoa',
      true,
      AREA_TRAFEGO,
    )
    expect(comoModerador.answers[0]!.canEdit).toBe(true)

    const comoTerceiro = paraForumQuestion(
      linha({ answers: [respostaDe('resp-1')] }),
      'outra-pessoa',
      false,
      AREA_TRAFEGO,
    )
    expect(comoTerceiro.answers[0]!.canEdit).toBe(false)
  })
})
