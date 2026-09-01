import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminClient, authClient, createTestUser, criarLixeira } from './client'

const db = adminClient()
const lixeira = criarLixeira()

let areaTrafego: string
let areaDesign: string

let liderId: string
let emailLiderTrafego: string
let emailTrafego: string
let emailDesigner: string
let emailAdminAtivo: string
let emailAdminInativo: string

let cursoTrafego: string
let aulaTrafego: string
let cursoRascunho: string

beforeAll(async () => {
  const stamp = Date.now()

  const { data: areas, error: areasError } = await db
    .from('areas')
    .insert([
      { name: 'Tráfego', slug: `trafego-rls-${stamp}` },
      { name: 'Design', slug: `design-rls-${stamp}` },
    ])
    .select('id, slug')
  if (areasError) throw areasError

  areaTrafego = areas!.find((a) => a.slug.startsWith('trafego'))!.id
  areaDesign = areas!.find((a) => a.slug.startsWith('design'))!.id
  lixeira.area(areaTrafego)
  lixeira.area(areaDesign)

  emailLiderTrafego = `lider-t-${stamp}@gexcorp.com.br`
  emailTrafego = `aluno-t-${stamp}@gexcorp.com.br`
  emailDesigner = `aluno-d-${stamp}@gexcorp.com.br`
  emailAdminAtivo = `admin-ativo-rls-${stamp}@gexcorp.com.br`
  emailAdminInativo = `admin-inativo-rls-${stamp}@gexcorp.com.br`

  liderId = await createTestUser({
    email: emailLiderTrafego,
    fullName: 'Líder Tráfego',
    role: 'leader',
    areaId: areaTrafego,
  })
  lixeira.usuario(liderId)

  lixeira.usuario(
    await createTestUser({
      email: emailTrafego,
      fullName: 'Aluno Tráfego',
      role: 'member',
      areaId: areaTrafego,
    }),
  )
  lixeira.usuario(
    await createTestUser({
      email: emailDesigner,
      fullName: 'Aluno Design',
      role: 'member',
      areaId: areaDesign,
    }),
  )
  // Papel admin, não a área de ninguém: existe só para provar que
  // auth_is_active() corta o acesso mesmo de quem administra a plataforma.
  lixeira.usuario(
    await createTestUser({
      email: emailAdminAtivo,
      fullName: 'Admin Ativo (RLS)',
      role: 'admin',
    }),
  )
  lixeira.usuario(
    await createTestUser({
      email: emailAdminInativo,
      fullName: 'Admin Inativo (RLS)',
      role: 'admin',
      status: 'inactive',
    }),
  )

  const { data: curso, error: cursoError } = await db
    .from('courses')
    .insert({
      title: 'Meta Ads',
      slug: `meta-ads-${stamp}`,
      area_id: areaTrafego,
      owner_id: liderId,
      status: 'published',
    })
    .select('id')
    .single()
  if (cursoError) throw cursoError
  cursoTrafego = curso!.id
  lixeira.curso(cursoTrafego)

  const { data: aula, error: aulaError } = await db
    .from('lessons')
    .insert({
      course_id: cursoTrafego,
      title: 'Estrutura de campanha',
      slug: 'estrutura',
      video_provider: 'youtube',
      video_ref: 'dQw4w9WgXcQ',
      status: 'published',
    })
    .select('id')
    .single()
  if (aulaError) throw aulaError
  aulaTrafego = aula!.id

  const { error: anexoError } = await db.from('lesson_attachments').insert({
    lesson_id: aulaTrafego,
    file_name: 'planilha.xlsx',
    storage_path: `${aulaTrafego}/teste.xlsx`,
    mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size_bytes: 100,
    uploaded_by: liderId,
  })
  if (anexoError) throw anexoError

  // Rascunho na mesma área do líder: usado para provar que "gerenciar" é
  // diferente de "pertencer à área" quando o curso ainda não foi publicado.
  const { data: rascunho, error: rascunhoError } = await db
    .from('courses')
    .insert({
      title: 'Escala de Campanhas (rascunho)',
      slug: `escala-rascunho-${stamp}`,
      area_id: areaTrafego,
      owner_id: liderId,
      status: 'draft',
    })
    .select('id')
    .single()
  if (rascunhoError) throw rascunhoError
  cursoRascunho = rascunho!.id
  lixeira.curso(cursoRascunho)
})

afterAll(() => lixeira.limpar())

describe('RLS — a vitrine mostra, o conteúdo não', () => {
  it('designer enxerga o curso de tráfego na vitrine', async () => {
    const cliente = await authClient(emailDesigner)
    const { data } = await cliente.from('courses').select('id').eq('id', cursoTrafego)
    expect(data).toHaveLength(1)
  })

  it('designer NÃO enxerga os anexos do curso de tráfego', async () => {
    const cliente = await authClient(emailDesigner)
    const { data } = await cliente.from('lesson_attachments').select('id').eq('lesson_id', aulaTrafego)
    expect(data).toEqual([])
  })

  // Corrigido em 0004_corrige_leitura_de_aulas.sql: lessons_leitura tinha uma
  // terceira cláusula, sem can_access_course, só para deixar a vitrine CONTAR
  // aulas publicadas de cursos bloqueados. RLS não distingue coluna — a
  // cláusula liberava a LINHA inteira, video_ref incluído, e para um vídeo do
  // YouTube não listado o ref É o acesso (spec §8). Este teste prova que a
  // linha não vaza mais.
  it('designer NÃO enxerga a linha da aula do curso de tráfego', async () => {
    const cliente = await authClient(emailDesigner)
    const { data, error } = await cliente
      .from('lessons')
      .select('id, status, video_ref')
      .eq('id', aulaTrafego)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  // A vitrine ainda precisa mostrar "N aulas" em curso bloqueado (spec §6). A
  // função contar_aulas_publicadas() resolve isso sem expor a linha: devolve
  // só a contagem por curso, chamável por quem quer que seja — inclusive por
  // quem, como o designer aqui, não enxerga uma linha sequer de `lessons`.
  it('mesmo sem acesso, designer lê a contagem de aulas publicadas via RPC — sem ver a linha', async () => {
    const cliente = await authClient(emailDesigner)
    const { data, error } = await cliente.rpc('contar_aulas_publicadas')
    expect(error).toBeNull()
    const linhaDoCurso = data?.find((r) => r.course_id === cursoTrafego)
    expect(linhaDoCurso?.total).toBe(1)
  })

  it('designer NÃO enxerga o fórum do curso de tráfego', async () => {
    const cliente = await authClient(emailDesigner)
    const { error } = await cliente.from('questions').insert({
      lesson_id: aulaTrafego,
      author_id: (await cliente.auth.getUser()).data.user!.id,
      body: 'Consigo perguntar aqui?',
    })
    expect(error).not.toBeNull()
  })

  it('aluno de tráfego enxerga os anexos da própria área', async () => {
    const cliente = await authClient(emailTrafego)
    const { data } = await cliente.from('lesson_attachments').select('id').eq('lesson_id', aulaTrafego)
    expect(data).toHaveLength(1)
  })

  it('designer passa a enxergar os anexos depois da liberação individual', async () => {
    const cliente = await authClient(emailDesigner)
    const userId = (await cliente.auth.getUser()).data.user!.id

    const { error: grantError } = await db.from('course_access').insert({
      user_id: userId,
      course_id: cursoTrafego,
      granted_by: userId,
    })
    expect(grantError).toBeNull()

    const { data } = await cliente.from('lesson_attachments').select('id').eq('lesson_id', aulaTrafego)
    expect(data).toHaveLength(1)
  })

  // Controle da correção acima: com a mesma liberação individual (inserida no
  // teste anterior), a linha da aula — video_ref incluído — passa a ser
  // legível normalmente. Prova que a política nega por falta de acesso, não
  // por acidente: uma vez que o acesso existe, can_access_course libera.
  it('designer também passa a enxergar a aula depois da liberação individual', async () => {
    const cliente = await authClient(emailDesigner)
    const { data, error } = await cliente
      .from('lessons')
      .select('id, status, video_ref')
      .eq('id', aulaTrafego)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0]?.video_ref).toBe('dQw4w9WgXcQ')
  })

  // Um update barrado pelo RLS pode devolver "sucesso" sem alterar linha
  // nenhuma — por isso a prova real é reler com o admin client depois, e não o
  // retorno do update em si (ver convenção do projeto e tests/db/areas.test.ts).
  it('aluno não consegue editar curso de área nenhuma', async () => {
    const cliente = await authClient(emailTrafego)
    await cliente.from('courses').update({ title: 'Invadido' }).eq('id', cursoTrafego)

    const { data } = await db.from('courses').select('title').eq('id', cursoTrafego).single()
    expect(data!.title).toBe('Meta Ads')
  })

  it('líder de tráfego edita o próprio curso', async () => {
    const cliente = await authClient(emailLiderTrafego)
    const { error } = await cliente
      .from('courses')
      .update({ description: 'Curso completo de Meta Ads.' })
      .eq('id', cursoTrafego)
    expect(error).toBeNull()

    const { data } = await db.from('courses').select('description').eq('id', cursoTrafego).single()
    expect(data!.description).toBe('Curso completo de Meta Ads.')
  })
})

// Depende da liberação individual criada no describe acima (designer -> cursoTrafego).
describe('RLS — cada um vê a própria liberação (course_access)', () => {
  it('designer vê a própria liberação; aluno de tráfego não vê a liberação alheia; admin vê todas', async () => {
    const comoDesigner = await authClient(emailDesigner)
    const { data: propria } = await comoDesigner
      .from('course_access')
      .select('id')
      .eq('course_id', cursoTrafego)
    expect(propria).toHaveLength(1)

    const comoAlunoTrafego = await authClient(emailTrafego)
    const { data: alheia } = await comoAlunoTrafego
      .from('course_access')
      .select('id')
      .eq('course_id', cursoTrafego)
    expect(alheia).toEqual([])

    const comoAdmin = await authClient(emailAdminAtivo)
    const { data: viaAdmin } = await comoAdmin.from('course_access').select('id').eq('course_id', cursoTrafego)
    expect(viaAdmin).toHaveLength(1)
  })
})

// Prova que "gerenciar" (líder da área) e "pertencer à área" (colaborador
// comum) são coisas diferentes quando o curso é rascunho: a regra 4 do
// can_access_course diz que, a partir daí, rascunho é invisível para quem não
// gerencia — inclusive para quem é da mesma área.
describe('RLS — rascunho é invisível para quem não gerencia', () => {
  it('líder da área enxerga o rascunho da própria área', async () => {
    const cliente = await authClient(emailLiderTrafego)
    const { data } = await cliente.from('courses').select('id').eq('id', cursoRascunho)
    expect(data).toHaveLength(1)
  })

  it('colega da mesma área NÃO enxerga o rascunho — só quem gerencia', async () => {
    const cliente = await authClient(emailTrafego)
    const { data } = await cliente.from('courses').select('id').eq('id', cursoRascunho)
    expect(data).toEqual([])
  })
})

// auth_is_active() é a primeira condição de can_manage_course e can_access_course
// — "inativo" precisa vencer até o papel de admin. O controle (admin ativo)
// prova que a política discrimina por status, não que ela bloqueia todo mundo.
describe('RLS — inativo perde acesso mesmo sendo admin', () => {
  it('admin ativo gerencia curso publicado e rascunho de qualquer área', async () => {
    const cliente = await authClient(emailAdminAtivo)

    const { data: publicado } = await cliente.from('courses').select('id').eq('id', cursoTrafego)
    expect(publicado).toHaveLength(1)

    const { data: rascunho } = await cliente.from('courses').select('id').eq('id', cursoRascunho)
    expect(rascunho).toHaveLength(1)

    const { error } = await cliente
      .from('courses')
      .update({ description: 'Editado pelo admin.' })
      .eq('id', cursoRascunho)
    expect(error).toBeNull()

    const { data: apósEdicao } = await db.from('courses').select('description').eq('id', cursoRascunho).single()
    expect(apósEdicao!.description).toBe('Editado pelo admin.')
  })

  it('admin inativo não enxerga nada — nem curso publicado, nem rascunho', async () => {
    const cliente = await authClient(emailAdminInativo)

    const { data: publicado } = await cliente.from('courses').select('id').eq('id', cursoTrafego)
    expect(publicado).toEqual([])

    const { data: rascunho } = await cliente.from('courses').select('id').eq('id', cursoRascunho)
    expect(rascunho).toEqual([])
  })
})

// Corrigido em 0004_corrige_leitura_de_aulas.sql: o ramo "vejo a própria
// linha" de liberacoes_leitura e solicitacoes_leitura não exigia
// auth_is_active(), ao contrário de progresso_proprio (lesson_progress). Uma
// pessoa desativada ainda logava normalmente (status não bloqueia o Supabase
// Auth) e lia as próprias liberações e solicitações passadas.
describe('RLS — auth_is_active() também corta a leitura da própria liberação e solicitação', () => {
  it('pessoa desativada deixa de ler a própria liberação e a própria solicitação', async () => {
    const stamp = Date.now()
    const email = `colaborador-status-${stamp}@gexcorp.com.br`
    const userId = await createTestUser({
      email,
      fullName: 'Colaborador Status',
      role: 'member',
      areaId: areaTrafego,
    })
    lixeira.usuario(userId)

    const { error: grantError } = await db.from('course_access').insert({
      user_id: userId,
      course_id: cursoTrafego,
      granted_by: liderId,
    })
    expect(grantError).toBeNull()

    const { error: requestError } = await db.from('access_requests').insert({
      user_id: userId,
      course_id: cursoTrafego,
      status: 'pending',
    })
    expect(requestError).toBeNull()

    // Controle: enquanto ativa, a pessoa lê as próprias linhas normalmente.
    const clienteAtivo = await authClient(email)
    const { data: liberacaoAtiva } = await clienteAtivo.from('course_access').select('id').eq('user_id', userId)
    expect(liberacaoAtiva).toHaveLength(1)
    const { data: solicitacaoAtiva } = await clienteAtivo
      .from('access_requests')
      .select('id')
      .eq('user_id', userId)
    expect(solicitacaoAtiva).toHaveLength(1)

    const { error: desativaError } = await db.from('profiles').update({ status: 'inactive' }).eq('id', userId)
    expect(desativaError).toBeNull()

    // Mesma pessoa, agora desativada: as mesmas linhas somem.
    const clienteInativo = await authClient(email)
    const { data: liberacaoInativa } = await clienteInativo
      .from('course_access')
      .select('id')
      .eq('user_id', userId)
    expect(liberacaoInativa).toEqual([])
    const { data: solicitacaoInativa } = await clienteInativo
      .from('access_requests')
      .select('id')
      .eq('user_id', userId)
    expect(solicitacaoInativa).toEqual([])
  })
})
