import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AccessUser } from '@/lib/access'
import { paraCatalogItem, SELECT_CATALOGO, type LinhaCatalogo } from '@/server/catalog-query'
import { adminClient, authClient, createTestUser, criarLixeira } from './client'

// Prova, contra o Postgres de verdade, o achado que já custou uma correção de
// RLS nesta fase (0004_corrige_leitura_de_aulas.sql): a vitrine precisa saber
// quantas aulas publicadas um curso BLOQUEADO tem, sem que isso volte a expor
// a linha de `lessons` (video_ref incluído) para quem não tem acesso.
//
// Este teste roda a MESMA consulta (SELECT_CATALOGO) e a MESMA função de
// mapeamento (paraCatalogItem, logo canAccessCourse também) que getCatalog()
// usa em produção — autenticado como alguém sem nenhum acesso ao curso — em
// vez de simular o resultado. Um join ingênuo com `lessons` (em vez da RPC
// contar_aulas_publicadas) devolveria 0 aqui, silenciosamente, porque
// lessons_leitura barra a linha para este usuário; é exatamente o regresso
// que este teste captura.
const db = adminClient()
const lixeira = criarLixeira()

let areaTrafego: string
let areaDesign: string
let liderId: string
let emailLiderTrafego: string
let designerId: string
let emailDesigner: string
let cursoBloqueado: string

beforeAll(async () => {
  const stamp = Date.now()

  const { data: areas, error: areasError } = await db
    .from('areas')
    .insert([
      { name: 'Tráfego Catálogo', slug: `trafego-cat-${stamp}` },
      { name: 'Design Catálogo', slug: `design-cat-${stamp}` },
    ])
    .select('id, slug')
  if (areasError) throw areasError
  areaTrafego = areas!.find((a) => a.slug.startsWith('trafego'))!.id
  areaDesign = areas!.find((a) => a.slug.startsWith('design'))!.id
  lixeira.area(areaTrafego)
  lixeira.area(areaDesign)

  emailLiderTrafego = `lider-cat-${stamp}@gexcorp.com.br`
  liderId = await createTestUser({
    email: emailLiderTrafego,
    fullName: 'Líder Catálogo',
    role: 'leader',
    areaId: areaTrafego,
  })
  lixeira.usuario(liderId)

  emailDesigner = `designer-cat-${stamp}@gexcorp.com.br`
  designerId = await createTestUser({
    email: emailDesigner,
    fullName: 'Designer Catálogo',
    role: 'member',
    areaId: areaDesign,
  })
  lixeira.usuario(designerId)

  const { data: curso, error: cursoError } = await db
    .from('courses')
    .insert({
      title: 'Curso Bloqueado do Catálogo',
      slug: `curso-bloqueado-cat-${stamp}`,
      area_id: areaTrafego,
      owner_id: liderId,
      status: 'published',
    })
    .select('id')
    .single()
  if (cursoError) throw cursoError
  cursoBloqueado = curso!.id
  lixeira.curso(cursoBloqueado)

  // Duas aulas publicadas e uma em rascunho: a contagem certa é 2, não 3 (não
  // pode contar rascunho) nem 0 (não pode vir de uma linha que o RLS bloqueia).
  const { error: aulasError } = await db.from('lessons').insert([
    {
      course_id: cursoBloqueado,
      title: 'Aula 1',
      slug: 'aula-1',
      video_provider: 'youtube',
      video_ref: 'dQw4w9WgXcQ',
      status: 'published',
    },
    {
      course_id: cursoBloqueado,
      title: 'Aula 2',
      slug: 'aula-2',
      video_provider: 'youtube',
      video_ref: 'dQw4w9WgXcQ',
      status: 'published',
    },
    {
      course_id: cursoBloqueado,
      title: 'Aula 3 (rascunho)',
      slug: 'aula-3',
      video_provider: 'youtube',
      video_ref: 'dQw4w9WgXcQ',
      status: 'draft',
    },
  ])
  if (aulasError) throw aulasError
})

afterAll(() => lixeira.limpar())

describe('catálogo — contagem de aulas de um curso que o viewer não pode abrir', () => {
  it('designer sem acesso: vê o curso na vitrine, contagem correta (2), zero linhas de lessons', async () => {
    const cliente = await authClient(emailDesigner)

    // Controle: a linha de `lessons` continua invisível para este usuário —
    // se este efeito de RLS regredir, um join ingênuo passaria a "funcionar"
    // só porque a política ficou permissiva demais de novo.
    const { data: linhasDeAula } = await cliente
      .from('lessons')
      .select('id, video_ref')
      .eq('course_id', cursoBloqueado)
    expect(linhasDeAula).toEqual([])

    const { data: cursos, error: cursoError } = await cliente
      .from('courses')
      .select(SELECT_CATALOGO)
      .eq('status', 'published')
      .eq('id', cursoBloqueado)
    expect(cursoError).toBeNull()
    expect(cursos).toHaveLength(1)

    const { data: contagens, error: rpcError } = await cliente.rpc('contar_aulas_publicadas')
    expect(rpcError).toBeNull()
    const aulasPorCurso = new Map((contagens ?? []).map((linha) => [linha.course_id, Number(linha.total)]))

    const designer: AccessUser = { id: designerId, role: 'member', status: 'active', areaId: areaDesign }
    const item = paraCatalogItem(
      cursos![0] as unknown as LinhaCatalogo,
      designer,
      aulasPorCurso,
      new Map(),
      new Set(),
      new Set(),
    )

    expect(item.access).toBe('none')
    expect(item.lessonCount).toBe(2)
    expect(item.title).toBe('Curso Bloqueado do Catálogo')
  })

  it('líder da área: mesmo curso, mesma contagem (2), acesso de gestão em vez de bloqueado', async () => {
    const cliente = await authClient(emailLiderTrafego)

    const { data: cursos } = await cliente
      .from('courses')
      .select(SELECT_CATALOGO)
      .eq('status', 'published')
      .eq('id', cursoBloqueado)
    expect(cursos).toHaveLength(1)

    const { data: contagens } = await cliente.rpc('contar_aulas_publicadas')
    const aulasPorCurso = new Map((contagens ?? []).map((linha) => [linha.course_id, Number(linha.total)]))

    const lider: AccessUser = { id: liderId, role: 'leader', status: 'active', areaId: areaTrafego }
    const item = paraCatalogItem(
      cursos![0] as unknown as LinhaCatalogo,
      lider,
      aulasPorCurso,
      new Map(),
      new Set(),
      new Set(),
    )

    expect(item.access).toBe('manage')
    expect(item.lessonCount).toBe(2)
  })

  it('designer com solicitação pendente: contagem e bloqueio continuam iguais, requestStatus muda', async () => {
    const { error: solicitacaoError } = await db.from('access_requests').insert({
      user_id: designerId,
      course_id: cursoBloqueado,
      status: 'pending',
    })
    expect(solicitacaoError).toBeNull()

    const cliente = await authClient(emailDesigner)
    const { data: cursos } = await cliente
      .from('courses')
      .select(SELECT_CATALOGO)
      .eq('status', 'published')
      .eq('id', cursoBloqueado)
    const { data: contagens } = await cliente.rpc('contar_aulas_publicadas')
    const { data: solicitacoes } = await cliente
      .from('access_requests')
      .select('course_id')
      .eq('user_id', designerId)
      .eq('status', 'pending')

    const aulasPorCurso = new Map((contagens ?? []).map((linha) => [linha.course_id, Number(linha.total)]))
    const pendentes = new Set((solicitacoes ?? []).map((s) => s.course_id))

    const designer: AccessUser = { id: designerId, role: 'member', status: 'active', areaId: areaDesign }
    const item = paraCatalogItem(
      cursos![0] as unknown as LinhaCatalogo,
      designer,
      aulasPorCurso,
      new Map(),
      new Set(),
      pendentes,
    )

    expect(item.access).toBe('none')
    expect(item.lessonCount).toBe(2)
    expect(item.requestStatus).toBe('pending')
  })
})
