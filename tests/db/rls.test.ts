import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '@/lib/supabase/database.types'
import { adminClient, authClient, createTestUser, criarLixeira } from './client'

const db = adminClient()
const lixeira = criarLixeira()

let areaTrafego: string
let areaDesign: string

let liderId: string
let alunoTrafegoId: string
let emailLiderTrafego: string
let emailTrafego: string
let emailDesigner: string
let adminAtivoId: string
let emailAdminAtivo: string
let emailAdminInativo: string

let cursoTrafego: string
let aulaTrafego: string
let cursoRascunho: string

// Curso/aula de outra área, inacessíveis ao aluno de Tráfego — alvo das
// tentativas de "realocação" (mover pergunta/resposta para dentro de um
// curso ao qual o autor não tem acesso).
let cursoDesignAlheio: string
let aulaDesignAlheio: string
// Fixtures pré-semeadas via admin client (não provam nada de INSERT — isso já
// é coberto nos testes do fórum) para os testes de UPDATE (realocação/
// impersonation) mais abaixo.
let perguntaTrafego: string
let perguntaAlheia: string

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

  alunoTrafegoId = await createTestUser({
    email: emailTrafego,
    fullName: 'Aluno Tráfego',
    role: 'member',
    areaId: areaTrafego,
  })
  lixeira.usuario(alunoTrafegoId)

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
  //
  // admin-ativo NÃO entra na lixeira compartilhada — ver afterAll mais abaixo
  // para o motivo (profiles_exige_admin torna impossível apagar o único
  // admin ativo do banco, por design).
  adminAtivoId = await createTestUser({
    email: emailAdminAtivo,
    fullName: 'Admin Ativo (RLS)',
    role: 'admin',
  })
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

  // Curso/aula de Design, publicados mas fora do alcance do aluno de
  // Tráfego — só servem de alvo para as tentativas de realocação abaixo.
  const { data: cursoAlheio, error: cursoAlheioError } = await db
    .from('courses')
    .insert({
      title: 'Curso Design Alheio',
      slug: `curso-design-alheio-${stamp}`,
      area_id: areaDesign,
      owner_id: liderId,
      status: 'published',
    })
    .select('id')
    .single()
  if (cursoAlheioError) throw cursoAlheioError
  cursoDesignAlheio = cursoAlheio!.id
  lixeira.curso(cursoDesignAlheio)

  const { data: aulaAlheia, error: aulaAlheiaError } = await db
    .from('lessons')
    .insert({
      course_id: cursoDesignAlheio,
      title: 'Aula de Design',
      slug: 'aula-design',
      video_provider: 'youtube',
      video_ref: 'dQw4w9WgXcQ',
      status: 'published',
    })
    .select('id')
    .single()
  if (aulaAlheiaError) throw aulaAlheiaError
  aulaDesignAlheio = aulaAlheia!.id

  const { data: pergunta, error: perguntaError } = await db
    .from('questions')
    .insert({ lesson_id: aulaTrafego, author_id: alunoTrafegoId, body: 'Dúvida original sobre a aula.' })
    .select('id')
    .single()
  if (perguntaError) throw perguntaError
  perguntaTrafego = pergunta!.id

  const { data: alheia, error: alheiaError } = await db
    .from('questions')
    .insert({ lesson_id: aulaDesignAlheio, author_id: liderId, body: 'Pergunta em curso alheio.' })
    .select('id')
    .single()
  if (alheiaError) throw alheiaError
  perguntaAlheia = alheia!.id
})

afterAll(async () => {
  await lixeira.limpar()

  // admin-ativo fica fora da lixeira compartilhada de propósito (achado 2 da
  // re-revisão): numa base recém-resetada, sem seed.sql, ele seria o ÚNICO
  // admin ativo do banco no momento da limpeza, e profiles_exige_admin
  // (0001) bloqueia por design apagar o último admin ativo da plataforma —
  // a invariante existe exatamente pra impedir isso, e não há como
  // contornar via SQL nem escolhendo outra ordem de exclusão (quem quer que
  // seja o ÚLTIMO admin ativo restante nunca pode ser apagado). Por isso a
  // checagem abaixo é feita ANTES de tentar apagar, consultando o estado
  // real do banco em vez de tentar-e-tratar o erro (a API de admin do
  // Supabase Auth não garante repassar a mensagem original do gatilho, então
  // não dava pra confiar em reconhecer "GX001" no erro).
  //
  // Nesta base de verdade, o admin real do product owner sempre está
  // presente, então a exclusão abaixo roda normalmente — é o que garante
  // zero rastro nas rodadas contra este projeto (conferido pelo dry-run de
  // limpeza depois de cada execução). Só numa base recém-resetada, sem outro
  // admin, é que admin-ativo fica pra trás — de propósito, documentado, em
  // vez de deixar a suíte inteira vermelha por causa de um invariante que
  // existe pra proteger a plataforma.
  const admin = adminClient()
  const { count } = await admin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin')
    .eq('status', 'active')
    .neq('id', adminAtivoId)

  if ((count ?? 0) > 0) {
    const { error } = await admin.auth.admin.deleteUser(adminAtivoId)
    if (error) throw error
  } else {
    console.warn(
      `criarLixeira: admin-ativo (${adminAtivoId}) não foi removido — é o único admin ativo do banco ` +
        'no momento da limpeza (profiles_exige_admin bloquearia a exclusão). Isso só acontece numa base ' +
        'recém-resetada, sem outro admin. Sweep manual eventual via scripts/limpar-dados-de-teste.mjs --apagar.',
    )
  }
})

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
  // só a contagem por curso, chamável por quem quer que seja autenticado e
  // ativo — inclusive por quem, como o designer aqui, não enxerga uma linha
  // sequer de `lessons`.
  it('mesmo sem acesso, designer lê a contagem de aulas publicadas via RPC — sem ver a linha', async () => {
    const cliente = await authClient(emailDesigner)
    const { data, error } = await cliente.rpc('contar_aulas_publicadas')
    expect(error).toBeNull()
    const linhaDoCurso = data?.find((r) => r.course_id === cursoTrafego)
    expect(linhaDoCurso?.total).toBe(1)
  })

  // O código do erro prova que é RLS (42501 = insufficient_privilege), não
  // qualquer outra falha (NOT NULL, coluna errada etc. também dariam
  // `error !== null`). O controle ao lado — aluno da área inserindo na mesma
  // aula — prova que perguntas_cria permite quem tem acesso; sem ele, este
  // teste passaria igual se a política negasse todo mundo.
  it('designer NÃO enxerga o fórum do curso de tráfego; aluno de tráfego consegue perguntar', async () => {
    const comoDesigner = await authClient(emailDesigner)
    const { error } = await comoDesigner.from('questions').insert({
      lesson_id: aulaTrafego,
      author_id: (await comoDesigner.auth.getUser()).data.user!.id,
      body: 'Consigo perguntar aqui?',
    })
    expect(error?.code).toBe('42501')

    const comoAlunoTrafego = await authClient(emailTrafego)
    const { data, error: erroAluno } = await comoAlunoTrafego
      .from('questions')
      .insert({ lesson_id: aulaTrafego, author_id: alunoTrafegoId, body: 'Outra dúvida sobre a aula.' })
      .select('id')
      .single()
    expect(erroAluno).toBeNull()
    expect(data?.id).toBeTruthy()
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

// 0005_endurece_politicas.sql, achado 1 (revisão): courses_escrita é FOR ALL,
// e para INSERT o Postgres só aplica WITH CHECK — que era uma terceira cópia
// manual da regra de "quem gerencia" e nunca chamava auth_is_active(). Como
// desativação não bloqueia o login (só o RLS corta o acesso), um líder
// desativado ainda conseguia logar e fazer POST em /rest/v1/courses.
describe('RLS — courses_escrita: WITH CHECK de INSERT também exige auth_is_active()', () => {
  it('líder desativado não consegue criar curso; líder ativo consegue', async () => {
    const stamp = Date.now()
    const emailLiderAtivo = `lider-insere-ativo-${stamp}@gexcorp.com.br`
    const emailLiderInativo = `lider-insere-inativo-${stamp}@gexcorp.com.br`

    lixeira.usuario(
      await createTestUser({
        email: emailLiderAtivo,
        fullName: 'Líder Insere Ativo',
        role: 'leader',
        areaId: areaTrafego,
      }),
    )
    const liderInativoId = await createTestUser({
      email: emailLiderInativo,
      fullName: 'Líder Insere Inativo',
      role: 'leader',
      areaId: areaTrafego,
      status: 'inactive',
    })
    lixeira.usuario(liderInativoId)

    const comoInativo = await authClient(emailLiderInativo)
    const slugFantasma = `curso-fantasma-${stamp}`
    const { error: erroInativo } = await comoInativo.from('courses').insert({
      title: 'Curso Fantasma',
      slug: slugFantasma,
      area_id: areaTrafego,
      owner_id: liderInativoId,
      status: 'draft',
    })
    expect(erroInativo?.code).toBe('42501')

    // A linha não pode ter sido criada — nem que o erro tivesse vindo por
    // outro motivo, uma tentativa de INSERT que falha não deixa rastro.
    const { data: naoExiste } = await db.from('courses').select('id').eq('slug', slugFantasma)
    expect(naoExiste).toEqual([])

    // Sem .select() encadeado aqui só por estilo (a confirmação abaixo usa
    // uma consulta separada) — não por necessidade. Desde 0007
    // (endurece_funcoes_security_definer), courses_leitura usa
    // can_manage_area(area_id), que avalia as colunas da própria linha, e
    // RETURNING enxerga a linha recém-inserida normalmente. Ver o teste "RLS
    // — courses_leitura: RETURNING funciona para curso recém-criado em
    // rascunho" mais abaixo, que prova .insert({...}).select('id').single()
    // funcionando para um curso em rascunho.
    const comoAtivo = await authClient(emailLiderAtivo)
    const ativoId = (await comoAtivo.auth.getUser()).data.user!.id
    const slugDeVerdade = `curso-de-verdade-${stamp}`
    const { error: erroAtivo } = await comoAtivo.from('courses').insert({
      title: 'Curso de Verdade',
      slug: slugDeVerdade,
      area_id: areaTrafego,
      owner_id: ativoId,
      status: 'draft',
    })
    expect(erroAtivo).toBeNull()

    const { data: criado } = await db.from('courses').select('id').eq('slug', slugDeVerdade).single()
    expect(criado?.id).toBeTruthy()
    if (criado) lixeira.curso(criado.id)

    // Controle extra: o próprio líder, numa consulta separada, também lê o
    // curso que acabou de criar (prova que courses_leitura funciona para ele
    // normalmente — o efeito do parágrafo acima é só dentro do mesmo INSERT).
    const { data: viaLider } = await comoAtivo.from('courses').select('id').eq('slug', slugDeVerdade)
    expect(viaLider).toHaveLength(1)
  })
})

// 0008_revisao_de_fase.sql, achado 3 (revisão de fase): courses_escrita não
// travava owner_id — um líder conseguia fazer PATCH em courses.owner_id do
// próprio curso e apontar para qualquer profile id. A fase 3 usa esse campo
// para notificar por e-mail o dono do curso (corpo da pergunta, títulos e
// link direto incluídos); sem o freio, um líder vira canal para empurrar
// conteúdo a qualquer colaborador, sem esse colaborador gerenciar nada.
describe('RLS — courses_escrita: owner_id travado para líder, livre para admin', () => {
  it('líder não reatribui owner_id do próprio curso; edição normal continua livre; admin reatribui', async () => {
    const stamp = Date.now()
    const outroPerfilId = await createTestUser({
      email: `outro-perfil-owner-${stamp}@gexcorp.com.br`,
      fullName: 'Outro Perfil (destino de reatribuição)',
      role: 'member',
      areaId: areaTrafego,
    })
    lixeira.usuario(outroPerfilId)

    const { data: curso, error: cursoError } = await db
      .from('courses')
      .insert({
        title: 'Curso Para Reatribuir Owner',
        slug: `curso-reatribuir-owner-${stamp}`,
        area_id: areaTrafego,
        owner_id: liderId,
        status: 'published',
      })
      .select('id')
      .single()
    expect(cursoError).toBeNull()
    lixeira.curso(curso!.id)

    const comoLider = await authClient(emailLiderTrafego)
    const { error: erroLider } = await comoLider
      .from('courses')
      .update({ owner_id: outroPerfilId })
      .eq('id', curso!.id)
    expect(erroLider?.code).toBe('42501')

    const { data: intacto } = await db.from('courses').select('owner_id').eq('id', curso!.id).single()
    expect(intacto!.owner_id).toBe(liderId)

    // Controle: editar outro campo do MESMO curso, sem tocar owner_id,
    // continua funcionando — a recusa acima é sobre a coluna, não sobre o
    // líder ter perdido a capacidade de editar o curso.
    const { error: erroDescricao } = await comoLider
      .from('courses')
      .update({ description: 'Descrição normal, sem mexer no dono.' })
      .eq('id', curso!.id)
    expect(erroDescricao).toBeNull()

    // Admin reatribui normalmente — a trava é específica de líder.
    const comoAdmin = await authClient(emailAdminAtivo)
    const { error: erroAdmin } = await comoAdmin
      .from('courses')
      .update({ owner_id: outroPerfilId })
      .eq('id', curso!.id)
    expect(erroAdmin).toBeNull()

    const { data: reatribuido } = await db.from('courses').select('owner_id').eq('id', curso!.id).single()
    expect(reatribuido!.owner_id).toBe(outroPerfilId)
  })
})

// Gap de teste da revisão de fase: nada provava que courses_escrita — cujo
// USING (can_manage_course(id)) e WITH CHECK (can_manage_area(area_id)) são
// colunas DIFERENTES desde 0007 — de fato impede um líder de mover um curso
// entre áreas. As duas direções importam: empurrar o PRÓPRIO curso para fora
// da área (USING passa, WITH CHECK barra) e puxar um curso ALHEIO para
// dentro da própria área (USING já barra a linha, nem chega no WITH CHECK).
describe('RLS — courses_escrita: líder não move curso entre áreas', () => {
  it('líder não empurra o próprio curso para outra área; admin consegue (controle)', async () => {
    const stamp = Date.now()
    const { data: curso, error: cursoError } = await db
      .from('courses')
      .insert({
        title: 'Curso Para Mover De Área',
        slug: `curso-mover-area-${stamp}`,
        area_id: areaTrafego,
        owner_id: liderId,
        status: 'published',
      })
      .select('id')
      .single()
    expect(cursoError).toBeNull()
    lixeira.curso(curso!.id)

    const comoLider = await authClient(emailLiderTrafego)
    const { error: erroLider } = await comoLider
      .from('courses')
      .update({ area_id: areaDesign })
      .eq('id', curso!.id)
    expect(erroLider?.code).toBe('42501')

    const { data: intacto } = await db.from('courses').select('area_id').eq('id', curso!.id).single()
    expect(intacto!.area_id).toBe(areaTrafego)

    // Controle: admin move o mesmo curso normalmente — a recusa acima é
    // sobre a AUTORIDADE do líder na área de destino, não uma trava
    // universal na coluna area_id.
    const comoAdmin = await authClient(emailAdminAtivo)
    const { error: erroAdmin } = await comoAdmin
      .from('courses')
      .update({ area_id: areaDesign })
      .eq('id', curso!.id)
    expect(erroAdmin).toBeNull()

    const { data: movido } = await db.from('courses').select('area_id').eq('id', curso!.id).single()
    expect(movido!.area_id).toBe(areaDesign)
  })

  it('líder não puxa curso alheio de outra área para dentro da própria (USING já barra a linha)', async () => {
    const stamp = Date.now()
    const { data: cursoAlheio, error: cursoError } = await db
      .from('courses')
      .insert({
        title: 'Curso Alheio Para Puxar',
        slug: `curso-alheio-puxar-${stamp}`,
        area_id: areaDesign,
        owner_id: liderId,
        status: 'published',
      })
      .select('id')
      .single()
    expect(cursoError).toBeNull()
    lixeira.curso(cursoAlheio!.id)

    const comoLiderTrafego = await authClient(emailLiderTrafego)
    // Sem erro explícito: USING de courses_escrita barra a linha antes do
    // WITH CHECK — o UPDATE afeta zero linhas (padrão do Postgres para RLS:
    // uma linha que a USING não seleciona simplesmente não entra no conjunto
    // afetado, não lança 42501).
    const { error, data } = await comoLiderTrafego
      .from('courses')
      .update({ area_id: areaTrafego })
      .eq('id', cursoAlheio!.id)
      .select('id')
    expect(error).toBeNull()
    expect(data).toEqual([])

    const { data: intacto } = await db.from('courses').select('area_id').eq('id', cursoAlheio!.id).single()
    expect(intacto!.area_id).toBe(areaDesign)

    // Controle: admin consegue puxar o mesmo curso alheio para Tráfego.
    const comoAdmin = await authClient(emailAdminAtivo)
    const { error: erroAdmin } = await comoAdmin
      .from('courses')
      .update({ area_id: areaTrafego })
      .eq('id', cursoAlheio!.id)
    expect(erroAdmin).toBeNull()

    const { data: puxado } = await db.from('courses').select('area_id').eq('id', cursoAlheio!.id).single()
    expect(puxado!.area_id).toBe(areaTrafego)
  })
})

// 0008_revisao_de_fase.sql, achado 2 (revisão de fase): progresso_proprio
// checava só "user_id = auth.uid() e auth_is_active()" — a foreign key era o
// único outro freio. Um colaborador ativo gravava progresso em QUALQUER
// aula, inclusive de curso ao qual não tem acesso — e progresso_gestao
// entrega essas linhas ao gestor do curso da aula.
describe('RLS — progresso_proprio: só registra progresso de aula que a pessoa acessa', () => {
  it('aluno de tráfego registra progresso na própria aula; é recusado numa aula que não acessa', async () => {
    const comoAlunoTrafego = await authClient(emailTrafego)

    const { error: erroPermitido } = await comoAlunoTrafego
      .from('lesson_progress')
      .insert({ user_id: alunoTrafegoId, lesson_id: aulaTrafego })
    expect(erroPermitido).toBeNull()

    const { data: registrado } = await db
      .from('lesson_progress')
      .select('user_id')
      .eq('user_id', alunoTrafegoId)
      .eq('lesson_id', aulaTrafego)
    expect(registrado).toHaveLength(1)

    const { error: erroNegado } = await comoAlunoTrafego
      .from('lesson_progress')
      .insert({ user_id: alunoTrafegoId, lesson_id: aulaDesignAlheio })
    expect(erroNegado?.code).toBe('42501')

    const { data: naoRegistrado } = await db
      .from('lesson_progress')
      .select('user_id')
      .eq('user_id', alunoTrafegoId)
      .eq('lesson_id', aulaDesignAlheio)
    expect(naoRegistrado).toEqual([])
  })
})

// 0005_endurece_politicas.sql, achado 2 (revisão): contar_aulas_publicadas()
// filtrava a LINHA certo, mas não tinha gate de quem pode CHAMAR — o
// Postgres concede EXECUTE a PUBLIC por padrão, e o Supabase concede a anon
// também. Duas camadas de correção, dois testes: o revoke de EXECUTE barra a
// chamada anônima antes de rodar; o "where auth_is_active()" dentro da
// função zera o resultado de quem está autenticado mas desativado.
describe('RLS — contar_aulas_publicadas(): EXECUTE revogado de anon/PUBLIC', () => {
  it('cliente anônimo não consegue chamar a RPC de contagem', async () => {
    const anon = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false } },
    )
    const { data, error } = await anon.rpc('contar_aulas_publicadas')
    expect(error?.code).toBe('42501')
    expect(data).toBeNull()
  })

  it('pessoa autenticada mas desativada recebe contagem vazia, mesmo podendo chamar a RPC', async () => {
    const cliente = await authClient(emailAdminInativo)
    const { data, error } = await cliente.rpc('contar_aulas_publicadas')
    expect(error).toBeNull()
    expect(data).toEqual([])
  })
})

// 0005_endurece_politicas.sql, achados 5 e 7 (revisão): perguntas_edita tinha
// `with check (true)` — qualquer coluna nova passava, inclusive lesson_id e
// author_id. respostas_edita travava author_id mas não question_id. A
// correção fixa as duas chaves ao valor já gravado via subconsulta
// autocorrelacionada (mesma técnica de profiles_ativa_a_si em 0001, agora
// contra o próprio id da linha em vez de auth.uid()).
describe('RLS — perguntas_edita/respostas_edita: WITH CHECK trava as chaves, não o corpo', () => {
  it('aluno de tráfego NÃO move a própria pergunta para uma aula de outra área (relocation)', async () => {
    const comoAlunoTrafego = await authClient(emailTrafego)
    const { error } = await comoAlunoTrafego
      .from('questions')
      .update({ lesson_id: aulaDesignAlheio })
      .eq('id', perguntaTrafego)
    expect(error?.code).toBe('42501')

    const { data } = await db.from('questions').select('lesson_id').eq('id', perguntaTrafego).single()
    expect(data!.lesson_id).toBe(aulaTrafego)
  })

  it('aluno de tráfego NÃO atribui a própria pergunta a outra pessoa (impersonation)', async () => {
    const comoAlunoTrafego = await authClient(emailTrafego)
    const { error } = await comoAlunoTrafego
      .from('questions')
      .update({ author_id: liderId })
      .eq('id', perguntaTrafego)
    expect(error?.code).toBe('42501')

    const { data } = await db.from('questions').select('author_id').eq('id', perguntaTrafego).single()
    expect(data!.author_id).toBe(alunoTrafegoId)
  })

  // Controle: sem isto, os dois testes acima só provariam "todo UPDATE é
  // barrado" — não que é especificamente lesson_id/author_id que ficaram
  // travados. Editar o corpo, a coluna que deveria continuar livre, precisa
  // continuar funcionando.
  it('aluno de tráfego ainda edita o corpo da própria pergunta normalmente', async () => {
    const comoAlunoTrafego = await authClient(emailTrafego)
    const { error } = await comoAlunoTrafego
      .from('questions')
      .update({ body: 'Dúvida editada sobre a aula.' })
      .eq('id', perguntaTrafego)
    expect(error).toBeNull()

    const { data } = await db.from('questions').select('body').eq('id', perguntaTrafego).single()
    expect(data!.body).toBe('Dúvida editada sobre a aula.')
  })

  it('autor de uma resposta NÃO move a resposta para uma pergunta de curso inacessível (relocation)', async () => {
    const comoAlunoTrafego = await authClient(emailTrafego)
    const { data: resposta, error: erroResposta } = await comoAlunoTrafego
      .from('answers')
      .insert({ question_id: perguntaTrafego, author_id: alunoTrafegoId, body: 'Resposta original.' })
      .select('id')
      .single()
    expect(erroResposta).toBeNull()

    const { error } = await comoAlunoTrafego
      .from('answers')
      .update({ question_id: perguntaAlheia })
      .eq('id', resposta!.id)
    expect(error?.code).toBe('42501')

    const { data } = await db.from('answers').select('question_id').eq('id', resposta!.id).single()
    expect(data!.question_id).toBe(perguntaTrafego)

    // Controle: editar o corpo da própria resposta continua funcionando.
    const { error: erroEdicaoValida } = await comoAlunoTrafego
      .from('answers')
      .update({ body: 'Resposta editada.' })
      .eq('id', resposta!.id)
    expect(erroEdicaoValida).toBeNull()
  })
})

// 0005_endurece_politicas.sql, achado 6 (revisão): anexos_leitura checava só
// can_access_course(course_id) — acesso de CURSO — sem filtrar por status da
// AULA, ao contrário de lessons_leitura (0004). Um curso publicado pode ter
// aulas ainda em rascunho; o anexo dessa aula (nome, caminho) vazava para
// qualquer um da área, mesmo que o líder não tivesse publicado a aula ainda.
describe('RLS — anexos_leitura: aula em rascunho não vaza nome de arquivo', () => {
  it('aluno de tráfego não vê o anexo de uma aula em rascunho do próprio curso; líder vê', async () => {
    const stamp = Date.now()
    const { data: aulaRascunho, error } = await db
      .from('lessons')
      .insert({
        course_id: cursoTrafego,
        title: 'Aula ainda não publicada',
        slug: `aula-rascunho-${stamp}`,
        video_provider: 'youtube',
        video_ref: 'dQw4w9WgXcQ',
        status: 'draft',
      })
      .select('id')
      .single()
    expect(error).toBeNull()

    const { error: anexoError } = await db.from('lesson_attachments').insert({
      lesson_id: aulaRascunho!.id,
      file_name: 'material-nao-publicado.pdf',
      storage_path: `${aulaRascunho!.id}/material.pdf`,
      mime_type: 'application/pdf',
      size_bytes: 100,
      uploaded_by: liderId,
    })
    expect(anexoError).toBeNull()

    const comoAlunoTrafego = await authClient(emailTrafego)
    const { data: viaAluno } = await comoAlunoTrafego
      .from('lesson_attachments')
      .select('id, file_name')
      .eq('lesson_id', aulaRascunho!.id)
    expect(viaAluno).toEqual([])

    const comoLider = await authClient(emailLiderTrafego)
    const { data: viaLider } = await comoLider
      .from('lesson_attachments')
      .select('id, file_name')
      .eq('lesson_id', aulaRascunho!.id)
    expect(viaLider).toHaveLength(1)
  })
})

// 0005_endurece_politicas.sql, achado 3 (revisão): limpar() engolia o erro de
// cada delete. O cenário concreto é o admin único depois de um db:reset sem
// seed — aqui reproduzimos o mesmo tipo de falha (uma exclusão bloqueada por
// FK) sem mexer no invariante de admin do projeto: área ainda referenciada
// por um curso de propósito não registrado nesta lixeira de teste.
describe('criarLixeira(): limpar() reporta falha em vez de engolir erro', () => {
  it('lança erro agregado quando uma exclusão falha', async () => {
    const stamp = Date.now()
    const lixeiraDeTeste = criarLixeira()

    const { data: area, error: areaError } = await db
      .from('areas')
      .insert({ name: 'Lixeira Presa', slug: `lixeira-presa-${stamp}` })
      .select('id')
      .single()
    expect(areaError).toBeNull()
    const areaId = area!.id
    lixeiraDeTeste.area(areaId)

    const donoId = await createTestUser({
      email: `dono-lixeira-${stamp}@gexcorp.com.br`,
      fullName: 'Dono Lixeira',
      role: 'leader',
      areaId,
    })

    // Curso NÃO registrado nesta lixeira de propósito: courses.area_id é ON
    // DELETE RESTRICT, então apagar a área com o curso ainda vivo falha.
    const { data: curso, error: cursoError } = await db
      .from('courses')
      .insert({
        title: 'Curso Preso',
        slug: `curso-preso-${stamp}`,
        area_id: areaId,
        owner_id: donoId,
        status: 'draft',
      })
      .select('id')
      .single()
    expect(cursoError).toBeNull()

    await expect(lixeiraDeTeste.limpar()).rejects.toThrow(/falha ao limpar/)

    // Limpeza manual, na ordem certa, para não deixar rastro deste teste.
    await db.from('courses').delete().eq('id', curso!.id)
    await db.from('areas').delete().eq('id', areaId)
    await db.auth.admin.deleteUser(donoId)
  })
})

// 0007_endurece_funcoes_security_definer.sql, achado 5 (re-revisão):
// courses_leitura chamava can_manage_course(id), que reconsulta `courses`
// por id — dentro de INSERT ... RETURNING isso não enxerga a própria linha
// no mesmo comando, e falhava com 42501 pra todo curso em rascunho (o
// status padrão). A tarefa 2 desta fase faz exatamente
// .insert({...}).select('id').single() ao criar um curso — sem este teste,
// ninguém pegaria a regressão até ela quebrar na tarefa 2.
describe('RLS — courses_leitura: RETURNING funciona para curso recém-criado em rascunho', () => {
  it('líder cria curso em rascunho com insert().select().single() e recebe a linha de volta', async () => {
    const stamp = Date.now()
    const cliente = await authClient(emailLiderTrafego)
    const { data, error } = await cliente
      .from('courses')
      .insert({
        title: 'Curso Novo em Rascunho',
        slug: `curso-novo-rascunho-${stamp}`,
        area_id: areaTrafego,
        owner_id: liderId,
        status: 'draft',
      })
      .select('id')
      .single()
    expect(error).toBeNull()
    expect(data?.id).toBeTruthy()
    if (data) lixeira.curso(data.id)
  })
})

// 0008_revisao_de_fase.sql, achado 4 (revisão de fase): anexos_storage_escrita
// concedia uma capacidade que a aplicação nunca usa — mintAttachmentUpload
// (src/server/attachments-upload.ts) sempre minta a URL assinada pelo
// cliente ADMIN, e o token resultante autoriza a escrita sozinho, sem
// consultar RLS nenhuma. A política antiga só deixava aberto um canal de
// escrita DIRETA e sem escopo (qualquer líder ativo gravava qualquer byte em
// qualquer caminho do bucket); removida.
//
// A prova que substitui a antiga (que testava o caminho DIRETO, agora
// deliberadamente sem política nenhuma) é em duas pontas: ninguém — nem o
// mesmo líder ativo que antes tinha permissão — consegue mais gravar objeto
// por upload direto; e o caminho de verdade da aplicação (mint pelo cliente
// admin + upload com a URL assinada, exatamente o que mintAttachmentUpload/
// uploadToSignedUrl fazem) continua funcionando — o token é a autorização,
// não RLS. Cobertura adicional do mesmo caminho, ponta a ponta pela camada
// de aplicação de verdade, em tests/db/attachments-upload.test.ts.
describe('RLS — storage de anexos: upload direto não tem política nenhuma; URL assinada continua funcionando', () => {
  it('líder ativo da área NÃO consegue mais subir objeto por upload direto', async () => {
    const cliente = await authClient(emailLiderTrafego)
    const caminho = `${aulaTrafego}/upload-direto-${Date.now()}.txt`
    const { error } = await cliente.storage
      .from('lesson-attachments')
      .upload(caminho, new Blob(['conteúdo de teste']), { contentType: 'text/plain' })
    expect(error).not.toBeNull()

    const { data: objetos } = await db.storage.from('lesson-attachments').list(aulaTrafego)
    expect(objetos?.some((o) => caminho.endsWith(o.name))).toBe(false)
  })

  it('upload via URL assinada (o caminho real da aplicação) continua funcionando para o mesmo líder', async () => {
    const caminho = `${aulaTrafego}/upload-assinado-${Date.now()}.txt`
    // db aqui é o cliente admin (service_role) — o mesmo papel que
    // mintAttachmentUpload usa para chamar createSignedUploadUrl.
    const { data: assinado, error: erroAssinatura } = await db.storage
      .from('lesson-attachments')
      .createSignedUploadUrl(caminho)
    expect(erroAssinatura).toBeNull()
    if (!assinado) return

    const cliente = await authClient(emailLiderTrafego)
    const { error: erroUpload } = await cliente.storage
      .from('lesson-attachments')
      .uploadToSignedUrl(assinado.path, assinado.token, new Blob(['conteúdo de teste']), {
        contentType: 'text/plain',
      })
    expect(erroUpload).toBeNull()

    const { data: objetos } = await db.storage.from('lesson-attachments').list(aulaTrafego)
    expect(objetos?.some((o) => caminho.endsWith(o.name))).toBe(true)

    await db.storage.from('lesson-attachments').remove([caminho])
  })
})

// Mesma forma do bloco acima, para o bucket 'capas' (migration
// 0012_bucket_de_capas.sql): PÚBLICO para leitura, mas sem NENHUMA política
// de escrita — o único jeito de gravar um objeto é com uma URL assinada,
// mintada pelo servidor (createCapaUpload, src/server/capas.ts) depois de
// checar papel e acesso ao recurso. Público não é o mesmo que "qualquer um
// escreve": a leitura pública dispensa RLS (o bucket resolve isso sozinho),
// mas a ESCRITA continua exigindo a mesma autorização de sempre.
describe('RLS — storage de capas: upload direto não tem política nenhuma; URL assinada continua funcionando', () => {
  it('líder ativo, gerenciando o próprio curso, NÃO consegue subir objeto por upload direto', async () => {
    const cliente = await authClient(emailLiderTrafego)
    const caminho = `curso/${cursoTrafego}/upload-direto-${Date.now()}.png`
    const { error } = await cliente.storage
      .from('capas')
      .upload(caminho, new Blob(['conteúdo de teste']), { contentType: 'image/png' })
    expect(error).not.toBeNull()

    const { data: objetos } = await db.storage.from('capas').list(`curso/${cursoTrafego}`)
    expect(objetos?.some((o) => caminho.endsWith(o.name))).toBe(false)
  })

  it('upload via URL assinada (o caminho real da aplicação) continua funcionando para o mesmo líder', async () => {
    const caminho = `curso/${cursoTrafego}/upload-assinado-${Date.now()}.png`
    // db aqui é o cliente admin (service_role) — o mesmo papel que
    // mintCapaUpload usa para chamar createSignedUploadUrl.
    const { data: assinado, error: erroAssinatura } = await db.storage
      .from('capas')
      .createSignedUploadUrl(caminho)
    expect(erroAssinatura).toBeNull()
    if (!assinado) return

    const cliente = await authClient(emailLiderTrafego)
    const { error: erroUpload } = await cliente.storage
      .from('capas')
      .uploadToSignedUrl(assinado.path, assinado.token, new Blob(['conteúdo de teste']), {
        contentType: 'image/png',
      })
    expect(erroUpload).toBeNull()

    const { data: objetos } = await db.storage.from('capas').list(`curso/${cursoTrafego}`)
    expect(objetos?.some((o) => caminho.endsWith(o.name))).toBe(true)

    await db.storage.from('capas').remove([caminho])
  })
})

// 0007_endurece_funcoes_security_definer.sql, achado 3 (re-revisão):
// perguntas_apaga/respostas_apaga nunca tinham teste em nenhuma rodada.
describe('RLS — perguntas_apaga/respostas_apaga: autor apaga; estranho não', () => {
  it('estranho não apaga a pergunta alheia; autor apaga a própria', async () => {
    const comoAlunoTrafego = await authClient(emailTrafego)
    const { data: pergunta, error: erroInsercao } = await comoAlunoTrafego
      .from('questions')
      .insert({ lesson_id: aulaTrafego, author_id: alunoTrafegoId, body: 'Pergunta para apagar depois.' })
      .select('id')
      .single()
    expect(erroInsercao).toBeNull()

    const comoDesigner = await authClient(emailDesigner)
    await comoDesigner.from('questions').delete().eq('id', pergunta!.id)
    const { data: aindaExiste } = await db.from('questions').select('id').eq('id', pergunta!.id)
    expect(aindaExiste).toHaveLength(1)

    const { error: erroAutor } = await comoAlunoTrafego.from('questions').delete().eq('id', pergunta!.id)
    expect(erroAutor).toBeNull()
    const { data: apagada } = await db.from('questions').select('id').eq('id', pergunta!.id)
    expect(apagada).toEqual([])
  })

  it('estranho não apaga a resposta alheia; autor apaga a própria', async () => {
    const comoAlunoTrafego = await authClient(emailTrafego)
    const { data: pergunta } = await comoAlunoTrafego
      .from('questions')
      .insert({ lesson_id: aulaTrafego, author_id: alunoTrafegoId, body: 'Pergunta base para resposta.' })
      .select('id')
      .single()

    const { data: resposta, error: erroResposta } = await comoAlunoTrafego
      .from('answers')
      .insert({ question_id: pergunta!.id, author_id: alunoTrafegoId, body: 'Resposta para apagar depois.' })
      .select('id')
      .single()
    expect(erroResposta).toBeNull()

    const comoDesigner = await authClient(emailDesigner)
    await comoDesigner.from('answers').delete().eq('id', resposta!.id)
    const { data: aindaExiste } = await db.from('answers').select('id').eq('id', resposta!.id)
    expect(aindaExiste).toHaveLength(1)

    const { error: erroAutor } = await comoAlunoTrafego.from('answers').delete().eq('id', resposta!.id)
    expect(erroAutor).toBeNull()
    const { data: apagada } = await db.from('answers').select('id').eq('id', resposta!.id)
    expect(apagada).toEqual([])
  })
})

// 0007_endurece_funcoes_security_definer.sql, achado 4 (re-revisão):
// is_pinned/resolved_at são sinais de moderação — a spec reserva ao líder.
// O autor conseguia se autofixar e se autorresolver antes desta correção.
describe('RLS — perguntas_edita: is_pinned/resolved_at travados pro autor, livres pra quem gerencia', () => {
  it('autor NÃO fixa nem resolve a própria pergunta; líder consegue', async () => {
    const comoAlunoTrafego = await authClient(emailTrafego)
    const { data: pergunta, error: erroInsercao } = await comoAlunoTrafego
      .from('questions')
      .insert({ lesson_id: aulaTrafego, author_id: alunoTrafegoId, body: 'Pergunta de moderação.' })
      .select('id')
      .single()
    expect(erroInsercao).toBeNull()

    const { error: erroAutorPin } = await comoAlunoTrafego
      .from('questions')
      .update({ is_pinned: true })
      .eq('id', pergunta!.id)
    expect(erroAutorPin?.code).toBe('42501')

    const { error: erroAutorResolve } = await comoAlunoTrafego
      .from('questions')
      .update({ resolved_at: new Date().toISOString() })
      .eq('id', pergunta!.id)
    expect(erroAutorResolve?.code).toBe('42501')

    const { data: aindaIntacta } = await db
      .from('questions')
      .select('is_pinned, resolved_at')
      .eq('id', pergunta!.id)
      .single()
    expect(aindaIntacta!.is_pinned).toBe(false)
    expect(aindaIntacta!.resolved_at).toBeNull()

    // Controle: sem isto, os dois testes acima só provariam "todo UPDATE de
    // is_pinned/resolved_at é barrado" — não que é o AUTOR especificamente
    // que fica de fora. Quem gerencia o curso da aula continua livre.
    const comoLider = await authClient(emailLiderTrafego)
    const { error: erroLider } = await comoLider
      .from('questions')
      .update({ is_pinned: true })
      .eq('id', pergunta!.id)
    expect(erroLider).toBeNull()

    const { data: depoisDoLider } = await db.from('questions').select('is_pinned').eq('id', pergunta!.id).single()
    expect(depoisDoLider!.is_pinned).toBe(true)
  })
})

// 0007_endurece_funcoes_security_definer.sql, achado 1 (re-revisão):
// pergunta_mantem_chaves/resposta_mantem_chaves tinham o mesmo furo que
// contar_aulas_publicadas (0005) tinha antes de ser corrigida: security
// definer, argumentos controlados por quem chama, sem revoke de EXECUTE —
// um POST anônimo respondia uma pergunta sobre `questions`/`answers` com
// RLS completamente ignorado.
describe('RLS — pergunta_mantem_chaves/resposta_mantem_chaves: EXECUTE revogado de anon/PUBLIC', () => {
  it('cliente anônimo não consegue chamar pergunta_mantem_chaves', async () => {
    const anon = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false } },
    )
    const { data, error } = await anon.rpc('pergunta_mantem_chaves', {
      p_id: perguntaTrafego,
      p_lesson_id: aulaTrafego,
      p_author_id: alunoTrafegoId,
      p_is_pinned: false,
      p_resolved_at: null,
    })
    expect(error?.code).toBe('42501')
    expect(data).toBeNull()
  })

  it('cliente anônimo não consegue chamar resposta_mantem_chaves', async () => {
    const anon = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false } },
    )
    const { data, error } = await anon.rpc('resposta_mantem_chaves', {
      p_id: '00000000-0000-0000-0000-000000000000',
      p_question_id: perguntaTrafego,
      p_author_id: alunoTrafegoId,
    })
    expect(error?.code).toBe('42501')
    expect(data).toBeNull()
  })
})
