import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AccessUser } from '@/lib/access'
import { paraCourseView, SELECT_CURSO_VIEW, type LinhaCursoView } from '@/server/viewer-query'
import { adminClient, authClient, createTestUser, criarLixeira } from './client'

// Prova, contra o Postgres de verdade, as duas propriedades que a Tarefa 6
// existe para garantir:
//
//   1. Curso bloqueado (access 'none') devolve metadados — não a lista de
//      aulas. tests/db/catalog.test.ts já prova isso para a CONTAGEM de
//      aulas da vitrine; este arquivo prova para a página do curso, onde o
//      risco é maior: getCourseView() embute `lessons(...)` na MESMA consulta
//      de `courses`, e é a política lessons_leitura (0004) — reforçada pelo
//      `access === 'none' ? [] : ...` em paraCourseView — quem garante que
//      esse embed vem vazio para quem não tem acesso.
//   2. Curso em rascunho é invisível para quem não gerencia — nem a capa —
//      inclusive para um colega da MESMA área do curso (não só para um
//      estranho de outra área): a regra 4 de canAccessCourse barra rascunho
//      ANTES de a regra 6 (mesma área) ter chance de aplicar.
//
// Roda a MESMA consulta (SELECT_CURSO_VIEW) e a MESMA função de mapeamento
// (paraCourseView, logo canAccessCourse também) que getCourseView() usa em
// produção, autenticado com a chave publicável (RLS real valendo) — em vez
// de simular o resultado.
const db = adminClient()
const lixeira = criarLixeira()

let areaTrafego: string
let areaDesign: string
let liderId: string
let emailLider: string
let membroTrafegoId: string
let emailMembroTrafego: string
let designerId: string
let emailDesigner: string
let cursoBloqueadoId: string
let slugBloqueado: string
let cursoRascunhoId: string
let slugRascunho: string
const capaRascunho = 'https://exemplo.com/capa-rascunho.jpg'

beforeAll(async () => {
  const stamp = Date.now()

  const { data: areas, error: areasError } = await db
    .from('areas')
    .insert([
      { name: 'Tráfego Viewer', slug: `trafego-viewer-${stamp}` },
      { name: 'Design Viewer', slug: `design-viewer-${stamp}` },
    ])
    .select('id, slug')
  if (areasError) throw areasError
  areaTrafego = areas!.find((a) => a.slug.startsWith('trafego'))!.id
  areaDesign = areas!.find((a) => a.slug.startsWith('design'))!.id
  lixeira.area(areaTrafego)
  lixeira.area(areaDesign)

  emailLider = `lider-viewer-${stamp}@gexcorp.com.br`
  liderId = await createTestUser({ email: emailLider, fullName: 'Líder Viewer', role: 'leader', areaId: areaTrafego })
  lixeira.usuario(liderId)

  emailMembroTrafego = `membro-t-viewer-${stamp}@gexcorp.com.br`
  membroTrafegoId = await createTestUser({
    email: emailMembroTrafego,
    fullName: 'Membro Tráfego Viewer',
    role: 'member',
    areaId: areaTrafego,
  })
  lixeira.usuario(membroTrafegoId)

  emailDesigner = `designer-viewer-${stamp}@gexcorp.com.br`
  designerId = await createTestUser({
    email: emailDesigner,
    fullName: 'Designer Viewer',
    role: 'member',
    areaId: areaDesign,
  })
  lixeira.usuario(designerId)

  // Curso publicado, bloqueado para o designer: 2 aulas publicadas e 1 em
  // rascunho — mesma forma do fixture de tests/db/catalog.test.ts, para
  // provar que o embed de `lessons` também zera aqui, não só a contagem.
  slugBloqueado = `curso-bloqueado-viewer-${stamp}`
  const { data: cursoBloqueado, error: cursoError } = await db
    .from('courses')
    .insert({
      title: 'Curso Bloqueado do Viewer',
      slug: slugBloqueado,
      description: 'Descrição visível mesmo bloqueado.',
      cover_url: 'https://exemplo.com/capa-bloqueado.jpg',
      area_id: areaTrafego,
      owner_id: liderId,
      status: 'published',
    })
    .select('id')
    .single()
  if (cursoError) throw cursoError
  cursoBloqueadoId = cursoBloqueado!.id
  lixeira.curso(cursoBloqueadoId)

  const { error: aulasError } = await db.from('lessons').insert([
    {
      course_id: cursoBloqueadoId,
      title: 'Aula 1',
      slug: 'aula-1',
      video_provider: 'youtube',
      video_ref: 'dQw4w9WgXcQ',
      status: 'published',
      position: 0,
    },
    {
      course_id: cursoBloqueadoId,
      title: 'Aula 2',
      slug: 'aula-2',
      video_provider: 'youtube',
      video_ref: 'dQw4w9WgXcQ',
      status: 'published',
      position: 1,
    },
    {
      course_id: cursoBloqueadoId,
      title: 'Aula 3 (rascunho)',
      slug: 'aula-3',
      video_provider: 'youtube',
      video_ref: 'dQw4w9WgXcQ',
      status: 'draft',
      position: 2,
    },
  ])
  if (aulasError) throw aulasError

  // Curso em RASCUNHO na área de Tráfego, com uma aula publicada — para
  // provar a invisibilidade mesmo para o próprio time.
  slugRascunho = `curso-rascunho-viewer-${stamp}`
  const { data: cursoRascunho, error: rascunhoError } = await db
    .from('courses')
    .insert({
      title: 'Curso Rascunho do Viewer',
      slug: slugRascunho,
      cover_url: capaRascunho,
      area_id: areaTrafego,
      owner_id: liderId,
      status: 'draft',
    })
    .select('id')
    .single()
  if (rascunhoError) throw rascunhoError
  cursoRascunhoId = cursoRascunho!.id
  lixeira.curso(cursoRascunhoId)

  const { error: aulaRascunhoError } = await db.from('lessons').insert({
    course_id: cursoRascunhoId,
    title: 'Aula do curso em rascunho',
    slug: 'aula-do-rascunho',
    video_provider: 'youtube',
    video_ref: 'dQw4w9WgXcQ',
    status: 'published',
  })
  if (aulaRascunhoError) throw aulaRascunhoError
})

afterAll(() => lixeira.limpar())

describe('viewer — curso bloqueado devolve metadados, nunca a lista de aulas', () => {
  it('designer sem acesso: o embed de lessons já vem vazio (RLS), e paraCourseView mantém vazio', async () => {
    const cliente = await authClient(emailDesigner)

    // Controle: a linha de `lessons` continua invisível para este usuário,
    // igual ao controle de tests/db/catalog.test.ts.
    const { data: linhasDeAula } = await cliente
      .from('lessons')
      .select('id, video_ref')
      .eq('course_id', cursoBloqueadoId)
    expect(linhasDeAula).toEqual([])

    const { data: cursos, error } = await cliente
      .from('courses')
      .select(SELECT_CURSO_VIEW)
      .eq('slug', slugBloqueado)
    expect(error).toBeNull()
    expect(cursos).toHaveLength(1)

    const row = cursos![0] as unknown as LinhaCursoView
    // A própria política lessons_leitura já devolve o embed vazio.
    expect(row.lessons).toEqual([])

    const designer: AccessUser = { id: designerId, role: 'member', status: 'active', areaId: areaDesign }
    const view = paraCourseView(row, designer, new Set())

    expect(view).not.toBeNull()
    expect(view!.access).toBe('none')
    expect(view!.lessons).toEqual([])
    // Metadados continuam presentes — é a assimetria "capa aparece, conteúdo não".
    expect(view!.title).toBe('Curso Bloqueado do Viewer')
    expect(view!.description).toBe('Descrição visível mesmo bloqueado.')
    expect(view!.coverUrl).toBe('https://exemplo.com/capa-bloqueado.jpg')
    expect(view!.areaName).toBe('Tráfego Viewer')
  })

  it('URL direta de uma aula dentro do curso bloqueado: a linha da aula também não chega (RLS)', async () => {
    const cliente = await authClient(emailDesigner)

    const { data } = await cliente
      .from('lessons')
      .select('id, slug, video_ref')
      .eq('course_id', cursoBloqueadoId)
      .eq('slug', 'aula-1')
      .maybeSingle()

    expect(data).toBeNull()
  })

  it('colega da própria área (acesso "view"): embed traz só as aulas publicadas, ordenadas', async () => {
    const cliente = await authClient(emailMembroTrafego)

    const { data: cursos } = await cliente.from('courses').select(SELECT_CURSO_VIEW).eq('slug', slugBloqueado)
    const row = cursos![0] as unknown as LinhaCursoView

    const membro: AccessUser = { id: membroTrafegoId, role: 'member', status: 'active', areaId: areaTrafego }
    const view = paraCourseView(row, membro, new Set())

    expect(view!.access).toBe('view')
    expect(view!.lessons.map((l) => l.slug)).toEqual(['aula-1', 'aula-2'])
  })
})

describe('viewer — curso em rascunho é invisível para quem não gerencia, capa incluída', () => {
  it('colega da MESMA área (membro, não líder): a linha não chega — nem para checar a capa', async () => {
    const cliente = await authClient(emailMembroTrafego)

    const { data, error } = await cliente
      .from('courses')
      .select(SELECT_CURSO_VIEW)
      .eq('slug', slugRascunho)
      .maybeSingle()

    expect(error).toBeNull()
    expect(data).toBeNull()
  })

  it('estranho de outra área: mesma invisibilidade', async () => {
    const cliente = await authClient(emailDesigner)

    const { data } = await cliente.from('courses').select(SELECT_CURSO_VIEW).eq('slug', slugRascunho).maybeSingle()
    expect(data).toBeNull()
  })

  it('líder da área: gerencia o rascunho, capa incluída, e vê a aula', async () => {
    const cliente = await authClient(emailLider)

    const { data, error } = await cliente
      .from('courses')
      .select(SELECT_CURSO_VIEW)
      .eq('slug', slugRascunho)
      .maybeSingle()
    expect(error).toBeNull()
    expect(data).not.toBeNull()

    const row = data as unknown as LinhaCursoView
    expect(row.cover_url).toBe(capaRascunho)

    const lider: AccessUser = { id: liderId, role: 'leader', status: 'active', areaId: areaTrafego }
    const view = paraCourseView(row, lider, new Set())

    expect(view!.access).toBe('manage')
    expect(view!.coverUrl).toBe(capaRascunho)
    expect(view!.lessons.map((l) => l.slug)).toEqual(['aula-do-rascunho'])
  })
})
