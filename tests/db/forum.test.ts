import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { paraForumQuestion, podeGerenciarArea, SELECT_PERGUNTAS, type LinhaPergunta } from '@/server/forum-query'
import { adminClient, authClient, createTestUser, criarLixeira } from './client'

// Prova, contra o Postgres de verdade, as duas coisas que a tarefa do fórum
// pede mais atenção:
//
// 1. O selo "Professor" (paraForumQuestion/podeGerenciarArea, ambas puras e
//    já cobertas por src/server/forum-query.test.ts com linhas fabricadas)
//    continua correto quando alimentada por uma linha REAL, trazida pela
//    MESMA string de select (SELECT_PERGUNTAS) que listQuestions usa em
//    produção — inclusive o embed aninhado `answers(...profiles(...))`, que
//    um teste com dado fabricado não pode confirmar sozinho.
// 2. Moderação (fixar/resolver/apagar) não depende só da checagem em
//    JavaScript dentro de forum.ts — RLS (perguntas_edita/perguntas_apaga,
//    já endurecidas nas fases anteriores, sem migration nova aqui) recusa a
//    mesma tentativa mesmo que alguém contorne a Server Action e fale
//    direto com o Postgres. O caso adversarial específico desta tarefa —
//    líder de OUTRA área com uma liberação AVULSA (course_access) no curso,
//    ou seja, acesso 'view' real, não 'manage' — não estava coberto em
//    nenhum teste anterior (rls.test.ts usa um estranho SEM acesso nenhum
//    para o mesmo cenário); é o que a seção final deste arquivo cobre.
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

  // Líder de Design ganha acesso AVULSO ao curso de Tráfego — 'view' via
  // canAccessCourse (regra 7), nunca 'manage' (regra 3 exige a MESMA área).
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

describe('listQuestions — a MESMA consulta (SELECT_PERGUNTAS) e o MESMO mapeamento (paraForumQuestion), com dado real', () => {
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

  // `listQuestions` (src/server/forum.ts) lê com o cliente ADMIN, não o da
  // sessão — achado desta própria suíte: `profiles` só libera leitura do
  // próprio perfil, de admin, ou de líder dentro da própria área
  // (0001_schema_inicial.sql); um colega comum lendo a pergunta de outra
  // pessoa não tem NENHUMA política que libere ler o perfil de quem
  // respondeu, e o embed `profiles(...)` volta null. contextoDaAula() já
  // confirmou o acesso à AULA antes de chegar aqui (getLessonView, a mesma
  // regra que perguntas_leitura/respostas_leitura espelham) — por isso este
  // helper roda com o mesmo cliente admin que a produção usa, não com
  // authClient(): testar com o cliente da sessão provaria uma consulta que
  // listQuestions não faz mais.
  async function buscarPergunta() {
    const { data, error } = await db.from('questions').select(SELECT_PERGUNTAS).eq('id', perguntaId).single()
    if (error) throw error
    return data as unknown as LinhaPergunta
  }

  it('o selo "Professor" aparece só para admin e para o líder DESTA área — nunca para o líder de outra, mesmo respondendo de verdade', async () => {
    const linha = await buscarPergunta()
    const pergunta = paraForumQuestion(linha, memberTrafegoId, false, areaTrafego)

    const porAutor = new Map(pergunta.answers.map((a) => [a.author.id, a]))
    expect(porAutor.get(adminId)?.author.isInstructor).toBe(true)
    expect(porAutor.get(leaderTrafegoId)?.author.isInstructor).toBe(true)
    expect(porAutor.get(leaderDesignId)?.author.isInstructor).toBe(false)
  })

  it('quem pergunta (colega comum) não tem selo nem pode moderar a própria pergunta', async () => {
    const linha = await buscarPergunta()
    const pergunta = paraForumQuestion(linha, memberTrafegoId, false, areaTrafego)
    expect(pergunta.author.isInstructor).toBe(false)
    expect(pergunta.canEdit).toBe(true)
    expect(pergunta.canModerate).toBe(false)
  })

  it('canModerate: true para admin e para o líder de Tráfego; false para o líder de Design, mesmo lendo a mesma pergunta real', async () => {
    // A linha (real, vinda do banco) é a mesma para todo mundo agora
    // (listQuestions sempre lê pelo cliente admin); o que muda por pessoa é
    // só o `podeModerar` que contextoDaAula calcula (podeGerenciarArea) e
    // passa como parâmetro — exatamente o que este teste varia.
    const linha = await buscarPergunta()

    const canModerateComo = (pessoa: { role: string; areaId: string | null }) =>
      paraForumQuestion(linha, 'quem-esta-vendo', podeGerenciarArea(pessoa, areaTrafego), areaTrafego).canModerate

    expect(canModerateComo({ role: 'admin', areaId: null })).toBe(true)
    expect(canModerateComo({ role: 'leader', areaId: areaTrafego })).toBe(true)
    expect(canModerateComo({ role: 'leader', areaId: areaDesign })).toBe(false)
  })

  it('respostas vêm ordenadas por created_at, não pela ordem de chegada do banco', async () => {
    const linha = await buscarPergunta()
    const pergunta = paraForumQuestion(linha, adminId, true, areaTrafego)
    const criadas = pergunta.answers.map((a) => a.createdAt)
    expect([...criadas].sort()).toEqual(criadas)
  })

  // ---------------------------------------------------------------------
  // O caso adversarial central da tarefa: um líder de OUTRA área com
  // liberação avulsa (course_access) consegue LER e RESPONDER (acesso
  // 'view' real, testado acima), mas RLS recusa qualquer tentativa de
  // moderar a pergunta de outra pessoa — mesmo sem passar pela Server
  // Action. perguntas_edita/perguntas_apaga (endurecidas nas fases
  // anteriores, sem migration nova aqui) são o que barra isto; a checagem
  // em JavaScript (podeGerenciarArea, provada acima) é a SEGUNDA camada, não
  // a única.
  // ---------------------------------------------------------------------
  it('líder de outra área, com acesso avulso: RLS recusa fixar, resolver e apagar a pergunta alheia', async () => {
    const comoLeaderDesign = await authClient(emailLeaderDesign)

    // PostgREST devolve 0 linhas afetadas (sem erro) quando o WITH CHECK
    // barra a escrita — a prova real é o estado no banco, checado logo
    // depois de cada tentativa, não o retorno da chamada em si.
    await comoLeaderDesign.from('questions').update({ is_pinned: true }).eq('id', perguntaId)
    const { data: aposFixar } = await db.from('questions').select('is_pinned').eq('id', perguntaId).single()
    expect(aposFixar!.is_pinned).toBe(false)

    await comoLeaderDesign.from('questions').update({ resolved_at: new Date().toISOString() }).eq('id', perguntaId)
    const { data: aposResolver } = await db.from('questions').select('resolved_at').eq('id', perguntaId).single()
    expect(aposResolver!.resolved_at).toBeNull()

    await comoLeaderDesign.from('questions').delete().eq('id', perguntaId)
    const { data: aindaExiste } = await db.from('questions').select('id').eq('id', perguntaId)
    expect(aindaExiste).toHaveLength(1)

    // Controle: quem realmente gerencia (líder de Tráfego) consegue fixar a
    // mesma pergunta — mostra que a recusa acima é por ÁREA, não porque a
    // política bloqueia todo mundo.
    const comoLeaderTrafego = await authClient(emailLeaderTrafego)
    const { error: erroControle } = await comoLeaderTrafego
      .from('questions')
      .update({ is_pinned: true })
      .eq('id', perguntaId)
    expect(erroControle).toBeNull()
    const { data: aposControle } = await db.from('questions').select('is_pinned').eq('id', perguntaId).single()
    expect(aposControle!.is_pinned).toBe(true)
  })

  it('líder de outra área, com acesso avulso: apaga a PRÓPRIA resposta, mas não a alheia', async () => {
    const comoLeaderDesign = await authClient(emailLeaderDesign)
    const { data: respostaAlheia } = await db
      .from('answers')
      .select('id')
      .eq('question_id', perguntaId)
      .eq('author_id', leaderTrafegoId)
      .single()

    await comoLeaderDesign.from('answers').delete().eq('id', respostaAlheia!.id)
    const { data: alheiaAindaExiste } = await db.from('answers').select('id').eq('id', respostaAlheia!.id)
    expect(alheiaAindaExiste).toHaveLength(1)

    const { data: respostaPropria } = await db
      .from('answers')
      .select('id')
      .eq('question_id', perguntaId)
      .eq('author_id', leaderDesignId)
      .single()
    const { error: erroApagarPropria } = await comoLeaderDesign.from('answers').delete().eq('id', respostaPropria!.id)
    expect(erroApagarPropria).toBeNull()
    const { data: propriaSumiu } = await db.from('answers').select('id').eq('id', respostaPropria!.id)
    expect(propriaSumiu).toHaveLength(0)
  })
})
