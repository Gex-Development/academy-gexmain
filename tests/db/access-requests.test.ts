import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminClient, authClient, createTestUser, criarLixeira } from './client'

// Task 5 — o risco desta tarefa não está no mapeamento de linhas
// (listAccessRequests/PendingRequest), que é trivial: está em QUEM pode
// decidir uma solicitação. `decideAccessRequest` (src/server/access-requests.ts)
// grava pela chave de serviço, então nada aqui exercita a Server Action em
// si — o que este arquivo prova é que `solicitacoes_decide`
// (0003_politicas_rls.sql), a política que sustenta a escrita, continua de
// pé: se ela regredisse (nesta ou numa migration futura), um colega
// aprovaria a própria solicitação e se daria acesso a qualquer curso, sem
// passar pela Server Action nem por um admin. RLS é a defesa de última linha
// para quem contorna a aplicação e fala direto com a API do Supabase — o
// mesmo raciocínio de tests/db/rls.test.ts e da seção final de
// tests/db/forum.test.ts.
//
// Cobre também o índice único parcial `access_requests_uma_pendente`: no
// máximo uma pendência por pessoa e curso, mas só ENQUANTO pendente — depois
// de decidida (aprovada ou negada), a mesma pessoa pode pedir de novo para o
// mesmo curso. Se o índice fosse total (sem o `where status = 'pending'`),
// quem foi negado uma vez nunca mais poderia pedir — o oposto do que a
// tela do cadeado promete.
const db = adminClient()
const lixeira = criarLixeira()

let area: string
let leaderId: string
let adminId: string
let emailAdmin: string
let memberAId: string
let emailMemberA: string
let memberBId: string
let emailMemberB: string
let curso: string

beforeAll(async () => {
  const stamp = Date.now()

  const { data: areaRow, error: areaError } = await db
    .from('areas')
    .insert({ name: 'Solicitações', slug: `solicitacoes-${stamp}` })
    .select('id')
    .single()
  if (areaError) throw areaError
  area = areaRow!.id
  lixeira.area(area)

  leaderId = await createTestUser({
    email: `lider-solicitacoes-${stamp}@gexcorp.com.br`,
    fullName: 'Líder Solicitações',
    role: 'leader',
    areaId: area,
  })
  lixeira.usuario(leaderId)

  emailAdmin = `admin-solicitacoes-${stamp}@gexcorp.com.br`
  adminId = await createTestUser({ email: emailAdmin, fullName: 'Admin Solicitações', role: 'admin' })
  lixeira.usuario(adminId)

  emailMemberA = `membro-a-solicitacoes-${stamp}@gexcorp.com.br`
  memberAId = await createTestUser({
    email: emailMemberA,
    fullName: 'Colega A Solicitações',
    role: 'member',
    areaId: area,
  })
  lixeira.usuario(memberAId)

  emailMemberB = `membro-b-solicitacoes-${stamp}@gexcorp.com.br`
  memberBId = await createTestUser({
    email: emailMemberB,
    fullName: 'Colega B Solicitações',
    role: 'member',
    areaId: area,
  })
  lixeira.usuario(memberBId)

  const { data: cursoRow, error: cursoError } = await db
    .from('courses')
    .insert({
      title: 'Curso Solicitações',
      slug: `curso-solicitacoes-${stamp}`,
      area_id: area,
      owner_id: leaderId,
      status: 'published',
    })
    .select('id')
    .single()
  if (cursoError) throw cursoError
  curso = cursoRow!.id
  lixeira.curso(curso)
})

// access_requests.course_id é ON DELETE CASCADE (via courses) e user_id
// também é ON DELETE CASCADE (via profiles) — como criarLixeira já apaga
// curso e usuários, as linhas de access_requests criadas neste arquivo somem
// junto, sem precisar de um bucket próprio. Mesmo mecanismo usado em
// tests/db/catalog.test.ts para a mesma tabela.
afterAll(() => lixeira.limpar())

describe('solicitacoes_decide e solicitacoes_leitura — RLS contra o Postgres de verdade, não a Server Action', () => {
  let pedidoAId: string
  let pedidoBId: string

  beforeAll(async () => {
    // memberA e memberB pedem acesso ao MESMO curso — pares (user_id,
    // course_id) diferentes, então não colidem com o índice único parcial.
    const comoMemberA = await authClient(emailMemberA)
    const { data: a, error: aErro } = await comoMemberA
      .from('access_requests')
      .insert({ user_id: memberAId, course_id: curso, status: 'pending' })
      .select('id')
      .single()
    if (aErro) throw aErro
    pedidoAId = a!.id

    const comoMemberB = await authClient(emailMemberB)
    const { data: b, error: bErro } = await comoMemberB
      .from('access_requests')
      .insert({ user_id: memberBId, course_id: curso, status: 'pending' })
      .select('id')
      .single()
    if (bErro) throw bErro
    pedidoBId = b!.id
  })

  it('um membro não consegue dar UPDATE numa solicitação — nem na própria (prova de que ninguém se autoaprova) — zero linhas, sem erro', async () => {
    const comoMemberA = await authClient(emailMemberA)

    const autoAprovar = await comoMemberA
      .from('access_requests')
      .update({ status: 'approved', decided_by: memberAId, decided_at: new Date().toISOString() })
      .eq('id', pedidoAId)
      .select('id')
    expect(autoAprovar.error).toBeNull()
    expect(autoAprovar.data).toEqual([])

    // Nem a de outra pessoa: memberA não é admin, então a mesma política
    // barra a tentativa também aqui — não é uma regra de "dono do recurso".
    const decidirAlheia = await comoMemberA
      .from('access_requests')
      .update({ status: 'denied', decided_by: memberAId, decided_at: new Date().toISOString() })
      .eq('id', pedidoBId)
      .select('id')
    expect(decidirAlheia.error).toBeNull()
    expect(decidirAlheia.data).toEqual([])

    // Confirma pelo cliente que ignora RLS: as tentativas acima não mudaram nada.
    const { data: statusA } = await db.from('access_requests').select('status').eq('id', pedidoAId).single()
    expect(statusA!.status).toBe('pending')
    const { data: statusB } = await db.from('access_requests').select('status').eq('id', pedidoBId).single()
    expect(statusB!.status).toBe('pending')
  })

  it('um membro lê a própria solicitação e não lê a de outra pessoa', async () => {
    const comoMemberA = await authClient(emailMemberA)

    const { data: propria, error: propriaErro } = await comoMemberA
      .from('access_requests')
      .select('id')
      .eq('id', pedidoAId)
    expect(propriaErro).toBeNull()
    expect(propria).toEqual([{ id: pedidoAId }])

    const { data: alheia, error: alheiaErro } = await comoMemberA
      .from('access_requests')
      .select('id')
      .eq('id', pedidoBId)
    expect(alheiaErro).toBeNull()
    expect(alheia).toEqual([])
  })

  it('um admin lê as duas solicitações e consegue decidir cada uma', async () => {
    const comoAdmin = await authClient(emailAdmin)

    const { data: ambas, error: leituraErro } = await comoAdmin
      .from('access_requests')
      .select('id')
      .in('id', [pedidoAId, pedidoBId])
    expect(leituraErro).toBeNull()
    expect(ambas).toHaveLength(2)

    const aprovar = await comoAdmin
      .from('access_requests')
      .update({ status: 'approved', decided_by: adminId, decided_at: new Date().toISOString() })
      .eq('id', pedidoAId)
      .eq('status', 'pending')
      .select('id')
    expect(aprovar.error).toBeNull()
    expect(aprovar.data).toHaveLength(1)

    const negar = await comoAdmin
      .from('access_requests')
      .update({ status: 'denied', decided_by: adminId, decided_at: new Date().toISOString() })
      .eq('id', pedidoBId)
      .eq('status', 'pending')
      .select('id')
    expect(negar.error).toBeNull()
    expect(negar.data).toHaveLength(1)

    const { data: statusA } = await db.from('access_requests').select('status').eq('id', pedidoAId).single()
    expect(statusA!.status).toBe('approved')
    const { data: statusB } = await db.from('access_requests').select('status').eq('id', pedidoBId).single()
    expect(statusB!.status).toBe('denied')
  })
})

describe('access_requests_uma_pendente — índice único parcial', () => {
  let emailMemberIndice: string
  let memberIndiceId: string

  beforeAll(async () => {
    const stamp = Date.now()
    emailMemberIndice = `membro-indice-solicitacoes-${stamp}@gexcorp.com.br`
    memberIndiceId = await createTestUser({
      email: emailMemberIndice,
      fullName: 'Colega Índice Solicitações',
      role: 'member',
      areaId: area,
    })
    lixeira.usuario(memberIndiceId)
  })

  it('uma segunda solicitação pendente da mesma pessoa para o mesmo curso falha com 23505; depois de decidida a primeira, uma nova é aceita', async () => {
    const comoMembro = await authClient(emailMemberIndice)

    const primeira = await comoMembro
      .from('access_requests')
      .insert({ user_id: memberIndiceId, course_id: curso, status: 'pending' })
      .select('id')
      .single()
    expect(primeira.error).toBeNull()

    // Enquanto a primeira segue pendente, uma segunda para o MESMO par falha.
    const segunda = await comoMembro
      .from('access_requests')
      .insert({ user_id: memberIndiceId, course_id: curso, status: 'pending' })
    expect(segunda.error?.code).toBe('23505')

    // A linha da tentativa recusada não existe — só a primeira permanece.
    const { data: pendentes } = await db
      .from('access_requests')
      .select('id')
      .eq('user_id', memberIndiceId)
      .eq('course_id', curso)
      .eq('status', 'pending')
    expect(pendentes).toHaveLength(1)

    // Admin decide a primeira — deixa de estar 'pending'.
    const comoAdmin = await authClient(emailAdmin)
    const decidida = await comoAdmin
      .from('access_requests')
      .update({ status: 'denied', decided_by: adminId, decided_at: new Date().toISOString() })
      .eq('id', primeira.data!.id)
      .eq('status', 'pending')
      .select('id')
    expect(decidida.error).toBeNull()
    expect(decidida.data).toHaveLength(1)

    // Índice é PARCIAL (`where status = 'pending'`): com a primeira já
    // decidida, uma nova pendência para o MESMO par é aceita — quem foi
    // negado consegue pedir de novo.
    const terceira = await comoMembro
      .from('access_requests')
      .insert({ user_id: memberIndiceId, course_id: curso, status: 'pending' })
      .select('id')
      .single()
    expect(terceira.error).toBeNull()
  })
})
