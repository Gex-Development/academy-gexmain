import { describe, expect, it } from 'vitest'
import type { AccessUser } from '@/lib/access'
import { acharNavegacao, paraCourseView, paraLessonDetail, type LinhaCursoView } from './viewer-query'

function linha(over: Partial<LinhaCursoView> = {}): LinhaCursoView {
  return {
    id: 'c1',
    slug: 'curso-1',
    title: 'Curso 1',
    description: 'Descrição do curso.',
    cover_url: 'https://exemplo.com/capa.jpg',
    status: 'published',
    is_onboarding: false,
    area_id: 'area-trafego',
    areas: { name: 'Tráfego' },
    lessons: [
      { id: 'l1', slug: 'aula-1', title: 'Aula 1', duration_seconds: 300, status: 'published', position: 0 },
      { id: 'l2', slug: 'aula-2', title: 'Aula 2', duration_seconds: 600, status: 'published', position: 1 },
      { id: 'l3', slug: 'aula-3', title: 'Aula 3 (rascunho)', duration_seconds: null, status: 'draft', position: 2 },
    ],
    ...over,
  }
}

// Colaborador de uma área diferente da do curso — não gerencia, não é da
// mesma área, sem liberação individual: canAccessCourse devolve 'none'.
const bloqueado: AccessUser = { id: 'u1', role: 'member', status: 'active', areaId: 'area-outra' }
// Colega da MESMA área do curso: acesso 'view' pela regra 6 de canAccessCourse.
const colega: AccessUser = { id: 'u2', role: 'member', status: 'active', areaId: 'area-trafego' }
// Líder da própria área do curso: 'manage'.
const lider: AccessUser = { id: 'u3', role: 'leader', status: 'active', areaId: 'area-trafego' }

describe('paraCourseView — a propriedade que a tarefa existe para garantir', () => {
  it('acesso "none": lessons vem vazio MESMO com a linha trazendo aulas populadas', () => {
    // Este é o caso adversarial: mesmo que o RLS de `lessons` algum dia
    // regrida e a consulta volte com a lista de aulas preenchida, a camada
    // de aplicação tem que zerar sozinha. Por isso o fixture `linha()` aqui
    // deliberadamente TEM 3 aulas — a defesa teria efeito zero se o teste
    // partisse de uma linha já vazia.
    const view = paraCourseView(linha(), bloqueado, new Set())
    expect(view).not.toBeNull()
    expect(view!.access).toBe('none')
    expect(view!.lessons).toEqual([])
  })

  it('acesso "none" ainda devolve os metadados: capa, título, área, descrição', () => {
    const view = paraCourseView(linha(), bloqueado, new Set())
    expect(view).toEqual({
      id: 'c1',
      slug: 'curso-1',
      title: 'Curso 1',
      description: 'Descrição do curso.',
      coverUrl: 'https://exemplo.com/capa.jpg',
      areaName: 'Tráfego',
      isOnboarding: false,
      access: 'none',
      lessons: [],
    })
  })

  it('liberação individual muda o acesso para "view" e revela as aulas publicadas', () => {
    const view = paraCourseView(linha(), bloqueado, new Set(['c1']))
    expect(view!.access).toBe('view')
    expect(view!.lessons.map((l) => l.slug)).toEqual(['aula-1', 'aula-2'])
  })

  it('curso em rascunho é invisível para quem não gerencia — devolve null, nem a capa', () => {
    // O colega é da MESMA área do curso — a regra 4 de canAccessCourse barra
    // rascunho ANTES de a regra 6 (mesma área) ter chance de aplicar, então
    // mesmo um colega de área não vê. É o caso explícito da autorrevisão.
    const view = paraCourseView(linha({ status: 'draft' }), colega, new Set())
    expect(view).toBeNull()
  })

  it('curso em rascunho é invisível para um estranho de outra área também', () => {
    const view = paraCourseView(linha({ status: 'draft' }), bloqueado, new Set())
    expect(view).toBeNull()
  })

  it('curso em rascunho: o líder da área gerencia e vê, inclusive as aulas em rascunho', () => {
    const view = paraCourseView(linha({ status: 'draft' }), lider, new Set())
    expect(view).not.toBeNull()
    expect(view!.access).toBe('manage')
    expect(view!.lessons.map((l) => l.slug)).toEqual(['aula-1', 'aula-2', 'aula-3'])
  })

  it('colega com acesso "view": vê só as aulas publicadas, ordenadas por position', () => {
    const view = paraCourseView(linha(), colega, new Set())
    expect(view!.access).toBe('view')
    expect(view!.lessons.map((l) => l.slug)).toEqual(['aula-1', 'aula-2'])
  })

  it('ordena as aulas por position, não pela ordem de chegada da linha', () => {
    const fora_de_ordem = linha({
      lessons: [
        { id: 'l2', slug: 'aula-2', title: 'Aula 2', duration_seconds: 600, status: 'published', position: 1 },
        { id: 'l1', slug: 'aula-1', title: 'Aula 1', duration_seconds: 300, status: 'published', position: 0 },
      ],
    })
    const view = paraCourseView(fora_de_ordem, colega, new Set())
    expect(view!.lessons.map((l) => l.slug)).toEqual(['aula-1', 'aula-2'])
  })

  it('trilha inicial (sem área): area_id e areas nulos viram areaName null', () => {
    const view = paraCourseView(linha({ is_onboarding: true, area_id: null, areas: null, lessons: [] }), bloqueado, new Set())
    expect(view!.access).toBe('view')
    expect(view!.areaName).toBeNull()
  })

  it('CourseView nunca carrega campo de vídeo ou anexo — só as chaves do tipo', () => {
    const view = paraCourseView(linha(), lider, new Set())
    expect(Object.keys(view!).sort()).toEqual(
      ['access', 'areaName', 'coverUrl', 'description', 'id', 'isOnboarding', 'lessons', 'slug', 'title'].sort(),
    )
    expect(Object.keys(view!.lessons[0]!).sort()).toEqual(['durationSeconds', 'id', 'slug', 'title'].sort())
  })
})

describe('paraLessonDetail — mapeamento 1:1 da linha de lessons', () => {
  it('mapeia snake_case para camelCase e o provider para o tipo VideoProvider', () => {
    const detalhe = paraLessonDetail({
      id: 'l1',
      slug: 'aula-1',
      title: 'Aula 1',
      description: 'Descrição da aula.',
      video_provider: 'youtube',
      video_ref: 'dQw4w9WgXcQ',
      duration_seconds: 300,
    })
    expect(detalhe).toEqual({
      id: 'l1',
      slug: 'aula-1',
      title: 'Aula 1',
      description: 'Descrição da aula.',
      provider: 'youtube',
      ref: 'dQw4w9WgXcQ',
      durationSeconds: 300,
    })
  })
})

describe('acharNavegacao — anterior/próxima', () => {
  const lessons = [{ slug: 'aula-1' }, { slug: 'aula-2' }, { slug: 'aula-3' }]

  it('primeira aula: sem anterior, com próxima', () => {
    expect(acharNavegacao(lessons, 'aula-1')).toEqual({ indice: 0, anterior: null, proxima: 'aula-2' })
  })

  it('aula do meio: anterior e próxima definidas', () => {
    expect(acharNavegacao(lessons, 'aula-2')).toEqual({ indice: 1, anterior: 'aula-1', proxima: 'aula-3' })
  })

  it('última aula: com anterior, sem próxima', () => {
    expect(acharNavegacao(lessons, 'aula-3')).toEqual({ indice: 2, anterior: 'aula-2', proxima: null })
  })

  it('curso com uma aula só: sem anterior, sem próxima', () => {
    expect(acharNavegacao([{ slug: 'unica' }], 'unica')).toEqual({ indice: 0, anterior: null, proxima: null })
  })

  it('slug que não está na lista (aula em rascunho para quem só tem "view", ou slug de outro curso): null', () => {
    expect(acharNavegacao(lessons, 'nao-existe')).toBeNull()
  })

  it('lista vazia (curso bloqueado, ou sem aulas publicadas): null', () => {
    expect(acharNavegacao([], 'aula-1')).toBeNull()
  })
})
