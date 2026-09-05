import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  paraForumQuestion,
  podeGerenciarArea,
  SELECT_PERGUNTAS,
  type LinhaPergunta,
  type PerfilAutor,
} from '@/server/forum-query'
import { adminClient, authClient, createTestUser, criarLixeira } from './client'

// Prova, contra o Postgres de verdade, as duas coisas que a tarefa do fórum
// pede mais atenção:
//
// 1. O selo "Professor" (paraForumQuestion/podeGerenciarArea, ambas puras e
//    já cobertas por src/server/forum-query.test.ts com linhas fabricadas)
//    continua correto quando alimentado por uma linha REAL (lida pelo
//    cliente da SESSÃO, sob RLS — a mesma consulta de listQuestions) e por
//    perfis REAIS (buscados à parte pela chave de serviço, do jeito que
//    buscarPerfisAutores faz em produção).
// 2. Moderação (fixar/resolver/apagar) hoje é sustentada por RLS de
//    verdade — togglePinned/toggleResolved/deleteQuestion/deleteAnswer
//    gravam pelo cliente da SESSÃO (rodada de correção 1), então
//    perguntas_edita/perguntas_apaga/respostas_apaga (endurecidas nas fases
//    anteriores, sem migration nova aqui) são a MESMA política que a
//    produção atravessa, não só uma defesa para quem contorna a Server
//    Action. O caso adversarial específico desta tarefa — líder de OUTRA
//    área com uma liberação AVULSA (course_access) no curso, ou seja,
//    acesso 'view' real, não 'manage' — não estava coberto em nenhum teste
//    anterior (rls.test.ts usa um estranho SEM acesso nenhum para o mesmo
//    cenário); é o que a seção final deste arquivo cobre.
//
// listQuestions/askQuestion/togglePinned etc. em si não são chamáveis fora
// de um request Next.js de verdade (createServerSupabase() → cookies() →
// "called outside a request scope", mesma limitação documentada em
// tests/db/courses.test.ts e repetida em todo outro teste de banco do
// projeto) — por isso este arquivo roda a MESMA consulta e a MESMA função de
// mapeamento que as actions usam, e exercita a autorização de escrita
// (INSERT/UPDATE/DELETE) com os clientes autenticados de cada papel, do
// mesmo jeito que rls.test.ts já faz para o resto do fórum.
const db = adminClient()
const lixeira = criarLixeira()

let areaTrafego: string
let areaDesign: string

let adminId: string
let emailAdmin: string
let leaderTrafegoId: string
let emailLeaderTrafego: string
let leaderDesignId: string
let emailLeaderDesign: string
let memberTrafegoId: string
let emailMemberTrafego: string
let memberDesignId: string
let emailMemberDesign: string

let cursoTrafego: string
let aulaTrafego: string
let aulaTrafegoRascunho: string

beforeAll(async () => {
  const stamp = Date.now()

  const { data: areas, error: areasError } = await db
    .from('areas')
    .insert([
      { name: 'Fórum Tráfego', slug: `forum-trafego-${stamp}` },
      { name: 'Fórum Design', slug: `forum-design-${stamp}` },
    ])
    .select('id, slug')
  if (areasError) throw areasError
  areaTrafego = areas!.find((a) => a.slug.startsWith('forum-trafego'))!.id
  areaDesign = areas!.find((a) => a.slug.startsWith('forum-design'))!.id
  lixeira.area(areaTrafego)
  lixeira.area(areaDesign)

  emailAdmin = `admin-forum-${stamp}@gexcorp.com.br`
  adminId = await createTestUser({ email: emailAdmin, fullName: 'Admin Fórum', role: 'admin' })
  lixeira.usuario(adminId)

  emailLeaderTrafego = `lider-forum-t-${stamp}@gexcorp.com.br`
  leaderTrafegoId = await createTestUser({
    email: emailLeaderTrafego,
    fullName: 'Líder Tráfego Fórum',
    role: 'leader',
    areaId: areaTrafego,
  })
  lixeira.usuario(leaderTrafegoId)

  emailLeaderDesign = `lider-forum-d-${stamp}@gexcorp.com.br`
  leaderDesignId = await createTestUser({
    email: emailLeaderDesign,
    fullName: 'Líder Design Fórum',
    role: 'leader',
    areaId: areaDesign,
  })
  lixeira.usuario(leaderDesignId)

  emailMemberTrafego = `membro-forum-t-${stamp}@gexcorp.com.br`
  memberTrafegoId = await createTestUser({
    email: emailMemberTrafego,
    fullName: 'Colega Tráfego Fórum',
    role: 'member',
    areaId: areaTrafego,
  })
  lixeira.usuario(memberTrafegoId)

  emailMemberDesign = `membro-forum-d-${stamp}@gexcorp.com.br`
  memberDesignId = await createTestUser({
    email: emailMemberDesign,
    fullName: 'Colega Design Fórum',
    role: 'member',
    areaId: areaDesign,
  })
  lixeira.usuario(memberDesignId)

  const { data: curso, error: cursoError } = await db
    .from('courses')
    .insert({
      title: 'Curso Fórum Tráfego',
      slug: `curso-forum-trafego-${stamp}`,
      area_id: areaTrafego,
      owner_id: leaderTrafegoId,
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
      title: 'Aula Fórum',
      slug: 'aula-forum',
      video_provider: 'youtube',
      video_ref: 'dQw4w9WgXcQ',
      status: 'published',
    })
    .select('id')
    .single()
  if (aulaError) throw aulaError
  aulaTrafego = aula!.id

  // Aula do MESMO curso ainda em rascunho (0009_endurece_escrita_do_forum) —
  // o curso é publicado (o colega tem can_access_course true), mas esta aula
  // específica não. Existe só para a seção "perguntas_cria/respostas_cria —
  // aula em rascunho" mais abaixo.
  const { data: aulaRascunho, error: aulaRascunhoError } = await db
    .from('lessons')
    .insert({
      course_id: cursoTrafego,
      title: 'Aula Fórum (rascunho)',
      slug: 'aula-forum-rascunho',
      video_provider: 'youtube',
      video_ref: 'dQw4w9WgXcQ',
      status: 'draft',
    })
    .select('id')
    .single()
  if (aulaRascunhoError) throw aulaRascunhoError
  aulaTrafegoRascunho = aulaRascunho!.id

  // Líder de Design ganha acesso AVULSO ao curso de Tráfego — 'view' via
  // canAccessCourse (regra 8), nunca 'manage' (regra 3 exige a MESMA área).
  // É o caso central desta suíte: acesso real, sem virar professor nem
  // moderador.
  const { error: grantError } = await db
    .from('course_access')
    .insert({ user_id: leaderDesignId, course_id: cursoTrafego, granted_by: adminId })
  if (grantError) throw grantError
})

afterAll(() => lixeira.limpar())

describe('podeGerenciarArea — o mesmo cálculo usado para o selo e para a moderação, contra pessoas reais', () => {
  it('admin gerencia; líder de Tráfego gerencia; líder de Design (mesmo com acesso avulso) não; colega não', () => {
    expect(podeGerenciarArea({ role: 'admin', areaId: null }, areaTrafego)).toBe(true)
    expect(podeGerenciarArea({ role: 'leader', areaId: areaTrafego }, areaTrafego)).toBe(true)
    expect(podeGerenciarArea({ role: 'leader', areaId: areaDesign }, areaTrafego)).toBe(false)
    expect(podeGerenciarArea({ role: 'member', areaId: areaTrafego }, areaTrafego)).toBe(false)
  })
})

describe('askQuestion/answerQuestion — o INSERT que a action faz, respeitando RLS de verdade', () => {
  it('colega da área pergunta; colega de outra área SEM acesso é recusado (42501)', async () => {
    const comoMemberDesign = await authClient(emailMemberDesign)
    const { error: negado } = await comoMemberDesign
      .from('questions')
      .insert({ lesson_id: aulaTrafego, author_id: memberDesignId, body: 'Consigo perguntar aqui?' })
    expect(negado?.code).toBe('42501')

    const comoMemberTrafego = await authClient(emailMemberTrafego)
    const { error: aceito } = await comoMemberTrafego
      .from('questions')
      .insert({ lesson_id: aulaTrafego, author_id: memberTrafegoId, body: 'Como uso o filtro X?' })
    expect(aceito).toBeNull()
  })
})

// 0009_endurece_escrita_do_forum.sql: perguntas_cria/respostas_cria exigiam
// só can_access_course(l.course_id) — acesso ao CURSO, não à AULA — então um
// colega com acesso ao curso publicava pergunta/resposta numa aula que o
// líder ainda nem publicou. A aula usada aqui (aulaTrafegoRascunho) vive no
// MESMO curso publicado que os testes acima já usam: can_access_course dá
// true para o colega de Tráfego (é por isso que ele consegue perguntar em
// aulaTrafego, provado logo acima) — a única diferença é l.status da aula
// em si, que é o que esta migration passou a checar.
describe('perguntas_cria/respostas_cria — aula em rascunho: só quem gerencia o curso publica (0009)', () => {
  it('colega com acesso ao curso não pergunta numa aula em rascunho (42501); o gestor do curso pergunta (é como ele testa a própria aula)', async () => {
    const comoMemberTrafego = await authClient(emailMemberTrafego)
    const { error: negado } = await comoMemberTrafego
      .from('questions')
      .insert({ lesson_id: aulaTrafegoRascunho, author_id: memberTrafegoId, body: 'Isto deveria ser recusado.' })
    expect(negado?.code).toBe('42501')
    const { data: naoExiste } = await db.from('questions').select('id').eq('lesson_id', aulaTrafegoRascunho)
    expect(naoExiste).toEqual([])

    const comoLeaderTrafego = await authClient(emailLeaderTrafego)
    const { error: aceito, data: pergunta } = await comoLeaderTrafego
      .from('questions')
      .insert({ lesson_id: aulaTrafegoRascunho, author_id: leaderTrafegoId, body: 'Pergunta de teste da própria aula.' })
      .select('id')
      .single()
    expect(aceito).toBeNull()
    expect(pergunta!.id).toBeTruthy()
  })

  it('colega com acesso ao curso não responde numa pergunta feita numa aula em rascunho (42501); o gestor do curso responde', async () => {
    // A pergunta em si é seedada pela chave de serviço (bypassa RLS) — não é
    // o alvo deste teste, que é respostas_cria, não perguntas_cria de novo.
    const { data: perguntaNaRascunho, error: perguntaError } = await db
      .from('questions')
      .insert({ lesson_id: aulaTrafegoRascunho, author_id: leaderTrafegoId, body: 'Pergunta seedada para testar resposta.' })
      .select('id')
      .single()
    if (perguntaError) throw perguntaError

    const comoMemberTrafego = await authClient(emailMemberTrafego)
    const { error: negado } = await comoMemberTrafego
      .from('answers')
      .insert({ question_id: perguntaNaRascunho!.id, author_id: memberTrafegoId, body: 'Isto deveria ser recusado.' })
    expect(negado?.code).toBe('42501')
    const { data: naoExiste } = await db.from('answers').select('id').eq('question_id', perguntaNaRascunho!.id)
    expect(naoExiste).toEqual([])

    const comoLeaderTrafego = await authClient(emailLeaderTrafego)
    const { error: aceito, data: resposta } = await comoLeaderTrafego
      .from('answers')
      .insert({ question_id: perguntaNaRascunho!.id, author_id: leaderTrafegoId, body: 'Resposta de teste da própria aula.' })
      .select('id')
      .single()
    expect(aceito).toBeNull()
    expect(resposta!.id).toBeTruthy()
  })
})

describe('listQuestions — a MESMA consulta (SELECT_PERGUNTAS, pelo cliente da sessão) e o MESMO mapeamento, com dado real', () => {
  let perguntaId: string

  beforeAll(async () => {
    const comoMemberTrafego = await authClient(emailMemberTrafego)
    const { data: pergunta, error: perguntaError } = await comoMemberTrafego
      .from('questions')
      .insert({ lesson_id: aulaTrafego, author_id: memberTrafegoId, body: 'Dúvida real de teste do fórum.' })
      .select('id')
      .single()
    if (perguntaError) throw perguntaError
    perguntaId = pergunta!.id

    // Três respostas: admin, líder DESTA área, e líder de OUTRA área (via
    // acesso avulso) — para o selo "Professor" ter os três casos numa
    // linha só, vindos do banco de verdade.
    const comoAdmin = await authClient(emailAdmin)
    const { error: erroAdmin } = await comoAdmin
      .from('answers')
      .insert({ question_id: perguntaId, author_id: adminId, body: 'Resposta do admin.' })
    if (erroAdmin) throw erroAdmin

    const comoLeaderTrafego = await authClient(emailLeaderTrafego)
    const { error: erroLeaderT } = await comoLeaderTrafego
      .from('answers')
      .insert({ question_id: perguntaId, author_id: leaderTrafegoId, body: 'Resposta do líder de Tráfego.' })
    if (erroLeaderT) throw erroLeaderT

    // Líder de Design só consegue responder por ter a liberação avulsa
    // seedada em beforeAll — é a mesma checagem de acesso (não de gerência)
    // que barra o colega de Design sem liberação, testada acima.
    const comoLeaderDesign = await authClient(emailLeaderDesign)
    const { error: erroLeaderD } = await comoLeaderDesign
      .from('answers')
      .insert({ question_id: perguntaId, author_id: leaderDesignId, body: 'Resposta do líder de Design.' })
    if (erroLeaderD) throw erroLeaderD
  })

  // `listQuestions` (src/server/forum.ts) lê `questions`/`answers` pelo
  // cliente da SESSÃO (perguntas_leitura/respostas_leitura sustentam o
  // conteúdo — rodada de correção 1) e busca os PERFIS dos autores à parte,
  // pela chave de serviço, restrito aos ids que apareceram — porque
  // `profiles` não tem política que libere um colega comum ler o perfil de
  // outra pessoa (0001_schema_inicial.sql). Este par de funções roda
  // exatamente essas duas consultas, na mesma ordem que a produção usa.
  async function buscarPergunta(email: string) {
    const cliente = await authClient(email)
    const { data, error } = await cliente.from('questions').select(SELECT_PERGUNTAS).eq('id', perguntaId).single()
    if (error) throw error
    return data as unknown as LinhaPergunta
  }

  async function buscarPerfis(linha: LinhaPergunta): Promise<Map<string, PerfilAutor>> {
    const ids = [linha.author_id, ...linha.answers.map((a) => a.author_id)]
    const { data } = await db.from('profiles').select('id, full_name, role, area_id, status').in('id', ids)
    return new Map(
      (data ?? []).map((p): [string, PerfilAutor] => [
        p.id,
        { full_name: p.full_name, role: p.role, area_id: p.area_id, status: p.status },
      ]),
    )
  }

  it('colega de outra área SEM acesso nenhum: a consulta de conteúdo (RLS) não devolve a pergunta — não é só a checagem em JS que barra', async () => {
    const comoMemberDesign = await authClient(emailMemberDesign)
    const { data, error } = await comoMemberDesign
      .from('questions')
      .select(SELECT_PERGUNTAS)
      .eq('id', perguntaId)
      .maybeSingle()
    expect(error).toBeNull()
    expect(data).toBeNull()
  })

  it('o selo "Professor" aparece só para admin e para o líder DESTA área — nunca para o líder de outra, mesmo respondendo de verdade', async () => {
    const linha = await buscarPergunta(emailMemberTrafego)
    const perfis = await buscarPerfis(linha)
    const pergunta = paraForumQuestion(linha, memberTrafegoId, false, areaTrafego, perfis)

    const porAutor = new Map(pergunta.answers.map((a) => [a.author.id, a]))
    expect(porAutor.get(adminId)?.author.isInstructor).toBe(true)
    expect(porAutor.get(leaderTrafegoId)?.author.isInstructor).toBe(true)
    expect(porAutor.get(leaderDesignId)?.author.isInstructor).toBe(false)
  })

  it('quem pergunta (colega comum) não tem selo nem pode moderar a própria pergunta', async () => {
    const linha = await buscarPergunta(emailMemberTrafego)
    const perfis = await buscarPerfis(linha)
    const pergunta = paraForumQuestion(linha, memberTrafegoId, false, areaTrafego, perfis)
    expect(pergunta.author.isInstructor).toBe(false)
    expect(pergunta.canDelete).toBe(true)
    expect(pergunta.canModerate).toBe(false)
  })

  it('canModerate: true para admin e para o líder de Tráfego; false para o líder de Design, mesmo lendo a mesma pergunta real', async () => {
    // A linha em si não muda por quem lê (todos os quatro têm acesso real
    // ao conteúdo); o que muda por pessoa é só o `podeModerar` que
    // contextoDaAula calcula (podeGerenciarArea) e passa como parâmetro —
    // exatamente o que este teste varia.
    const linha = await buscarPergunta(emailAdmin)
    const perfis = await buscarPerfis(linha)

    const canModerateComo = (pessoa: { role: string; areaId: string | null }) =>
      paraForumQuestion(linha, 'quem-esta-vendo', podeGerenciarArea(pessoa, areaTrafego), areaTrafego, perfis)
        .canModerate

    expect(canModerateComo({ role: 'admin', areaId: null })).toBe(true)
    expect(canModerateComo({ role: 'leader', areaId: areaTrafego })).toBe(true)
    expect(canModerateComo({ role: 'leader', areaId: areaDesign })).toBe(false)
  })

  it('respostas vêm ordenadas por created_at, não pela ordem de chegada do banco', async () => {
    const linha = await buscarPergunta(emailAdmin)
    const perfis = await buscarPerfis(linha)
    const pergunta = paraForumQuestion(linha, adminId, true, areaTrafego, perfis)
    const criadas = pergunta.answers.map((a) => a.createdAt)
    expect([...criadas].sort()).toEqual(criadas)
  })

  // ---------------------------------------------------------------------
  // O caso adversarial central da tarefa: um líder de OUTRA área com
  // liberação avulsa (course_access) consegue LER e RESPONDER (acesso
  // 'view' real, testado acima), mas RLS recusa qualquer tentativa de
  // moderar a pergunta de outra pessoa — pelo MESMO caminho que a produção
  // usa agora (togglePinned/toggleResolved/deleteQuestion gravam pelo
  // cliente da sessão desde a rodada de correção 1), não só para quem
  // contorna a Server Action. perguntas_edita/perguntas_apaga (endurecidas
  // nas fases anteriores, sem migration nova aqui) são o que barra isto; a
  // checagem em JavaScript (podeGerenciarArea, provada acima) é a PRIMEIRA
  // camada, não a única — e o `.select('id')` em cada tentativa abaixo
  // mostra o mecanismo exato que forum.ts usa para perceber a recusa: zero
  // linhas devolvidas, sem erro nenhum.
  // ---------------------------------------------------------------------
  it('líder de outra área, com acesso avulso: RLS recusa fixar, resolver e apagar a pergunta alheia (zero linhas, sem erro)', async () => {
    const comoLeaderDesign = await authClient(emailLeaderDesign)

    const fixar = await comoLeaderDesign.from('questions').update({ is_pinned: true }).eq('id', perguntaId).select('id')
    expect(fixar.error).toBeNull()
    expect(fixar.data).toEqual([])
    const { data: aposFixar } = await db.from('questions').select('is_pinned').eq('id', perguntaId).single()
    expect(aposFixar!.is_pinned).toBe(false)

    const resolver = await comoLeaderDesign
      .from('questions')
      .update({ resolved_at: new Date().toISOString() })
      .eq('id', perguntaId)
      .select('id')
    expect(resolver.error).toBeNull()
    expect(resolver.data).toEqual([])
    const { data: aposResolver } = await db.from('questions').select('resolved_at').eq('id', perguntaId).single()
    expect(aposResolver!.resolved_at).toBeNull()

    const apagar = await comoLeaderDesign.from('questions').delete().eq('id', perguntaId).select('id')
    expect(apagar.error).toBeNull()
    expect(apagar.data).toEqual([])
    const { data: aindaExiste } = await db.from('questions').select('id').eq('id', perguntaId)
    expect(aindaExiste).toHaveLength(1)

    // Controle: quem realmente gerencia (líder de Tráfego) consegue fixar a
    // mesma pergunta, e a chamada devolve a linha — mostra que a recusa
    // acima é por ÁREA, não porque a política bloqueia todo mundo.
    const comoLeaderTrafego = await authClient(emailLeaderTrafego)
    const controle = await comoLeaderTrafego.from('questions').update({ is_pinned: true }).eq('id', perguntaId).select('id')
    expect(controle.error).toBeNull()
    expect(controle.data).toHaveLength(1)
    const { data: aposControle } = await db.from('questions').select('is_pinned').eq('id', perguntaId).single()
    expect(aposControle!.is_pinned).toBe(true)
  })

  it('líder de outra área, com acesso avulso: apaga a PRÓPRIA resposta (zero linhas na alheia, sem erro)', async () => {
    const comoLeaderDesign = await authClient(emailLeaderDesign)
    const { data: respostaAlheia } = await db
      .from('answers')
      .select('id')
      .eq('question_id', perguntaId)
      .eq('author_id', leaderTrafegoId)
      .single()

    const apagarAlheia = await comoLeaderDesign.from('answers').delete().eq('id', respostaAlheia!.id).select('id')
    expect(apagarAlheia.error).toBeNull()
    expect(apagarAlheia.data).toEqual([])
    const { data: alheiaAindaExiste } = await db.from('answers').select('id').eq('id', respostaAlheia!.id)
    expect(alheiaAindaExiste).toHaveLength(1)

    const { data: respostaPropria } = await db
      .from('answers')
      .select('id')
      .eq('question_id', perguntaId)
      .eq('author_id', leaderDesignId)
      .single()
    const apagarPropria = await comoLeaderDesign.from('answers').delete().eq('id', respostaPropria!.id).select('id')
    expect(apagarPropria.error).toBeNull()
    expect(apagarPropria.data).toHaveLength(1)
    const { data: propriaSumiu } = await db.from('answers').select('id').eq('id', respostaPropria!.id)
    expect(propriaSumiu).toHaveLength(0)
  })
})
