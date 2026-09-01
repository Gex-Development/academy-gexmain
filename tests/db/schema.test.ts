import { beforeAll, describe, expect, it } from 'vitest'
import { adminClient, authClient, createTestUser } from './client'

const db = adminClient()
let areaId: string
let ownerId: string

beforeAll(async () => {
  const stamp = Date.now()
  const { data: area, error } = await db
    .from('areas')
    .insert({ name: 'Tráfego', slug: `trafego-${stamp}`, position: 1 })
    .select('id')
    .single()
  if (error) throw error
  areaId = area.id
  ownerId = await createTestUser({
    email: `lider-${stamp}@gexcorp.com.br`,
    fullName: 'Líder de Tráfego',
    role: 'leader',
    areaId,
  })
})

describe('restrições do schema', () => {
  it('recusa curso de onboarding com área preenchida', async () => {
    const { error } = await db.from('courses').insert({
      title: 'Trilha Inicial',
      slug: `trilha-invalida-${Date.now()}`,
      is_onboarding: true,
      area_id: areaId,
      owner_id: ownerId,
    })
    expect(error?.message).toContain('courses_onboarding_sem_area')
  })

  it('recusa curso comum sem área', async () => {
    const { error } = await db.from('courses').insert({
      title: 'Curso solto',
      slug: `curso-solto-${Date.now()}`,
      is_onboarding: false,
      area_id: null,
      owner_id: ownerId,
    })
    expect(error?.message).toContain('courses_onboarding_sem_area')
  })

  it('permite apenas uma trilha inicial na plataforma', async () => {
    const first = await db
      .from('courses')
      .insert({
        title: 'Trilha Inicial',
        slug: `trilha-a-${Date.now()}`,
        is_onboarding: true,
        area_id: null,
        owner_id: ownerId,
      })
      .select('id')
      .single()
    expect(first.error).toBeNull()

    const { error } = await db.from('courses').insert({
      title: 'Outra Trilha Inicial',
      slug: `trilha-b-${Date.now()}`,
      is_onboarding: true,
      area_id: null,
      owner_id: ownerId,
    })
    expect(error?.message).toContain('courses_uma_trilha_inicial')

    // Libera o índice único para os testes seguintes deste arquivo. Apaga
    // pelo id exato criado aqui, não por `like 'trilha-a-%'`: o banco de
    // desenvolvimento é remoto e compartilhado, e um padrão `like` alcançaria
    // linhas criadas por outras execuções concorrentes deste mesmo teste.
    await db.from('courses').delete().eq('id', first.data!.id)
  })

  it('recusa papel fora da lista permitida', async () => {
    // 'role' é 'text' com check constraint no banco, não um enum do Postgres —
    // o gerador de tipos do Supabase não promove checks para union types
    // (supabase/cli#1433 ainda em aberto), então `role` é tipado como `string`
    // e este valor inválido só é barrado em tempo de execução, pelo banco.
    const { error } = await db
      .from('profiles')
      .update({ role: 'professor' })
      .eq('id', ownerId)
    expect(error?.message).toContain('profiles_role_check')
  })

  it('recusa pergunta acima de 4000 caracteres', async () => {
    const { data: course } = await db
      .from('courses')
      .insert({
        title: 'Curso para fórum',
        slug: `curso-forum-${Date.now()}`,
        area_id: areaId,
        owner_id: ownerId,
      })
      .select('id')
      .single()

    const { data: lesson } = await db
      .from('lessons')
      .insert({
        course_id: course!.id,
        title: 'Aula 1',
        slug: 'aula-1',
        video_provider: 'youtube',
        video_ref: 'dQw4w9WgXcQ',
      })
      .select('id')
      .single()

    const { error } = await db.from('questions').insert({
      lesson_id: lesson!.id,
      author_id: ownerId,
      body: 'x'.repeat(4001),
    })
    expect(error?.message).toContain('questions_body_check')
  })
})

// Diferente dos testes acima (todos com service_role, que ignora RLS por
// completo), este usa um cliente autenticado como a própria pessoa convidada
// — é o único jeito de provar que a política `profiles_ativa_a_si` de fato
// barra a auto-promoção, e não só que o service_role consegue gravar.
describe('RLS: ativação da própria conta (profiles_ativa_a_si)', () => {
  it('recusa ativação que também muda role, area_id ou email; permite ativação simples', async () => {
    const stamp = Date.now()

    // Área real (não null) para o pin de area_id ser um teste de verdade:
    // com area_id já null, uma tentativa de "mudar" para null não mudaria
    // nada e passaria por acidente, sem provar que a coluna está fixada.
    const { data: area } = await db
      .from('areas')
      .insert({ name: 'Ativação Própria', slug: `ativacao-propria-${stamp}` })
      .select('id')
      .single()

    const email = `convidado-${stamp}@gexcorp.com.br`
    const userId = await createTestUser({
      email,
      fullName: 'Convidado de Teste',
      role: 'member',
      areaId: area!.id,
      status: 'invited',
    })

    const asInvitedUser = await authClient(email)

    // Cada tentativa isolada, para provar que cada coluna fixada barra
    // sozinha — não só a combinação delas. Mesmo padrão do vetor `tentativas`
    // em tests/db/people.test.ts ("RLS: edição do próprio perfil"), aplicado
    // aqui ao caminho de ativação: antes só o vetor `role` era exercitado
    // aqui, apesar do WITH CHECK de profiles_ativa_a_si (0001) também fixar
    // area_id e email.
    const tentativas = [
      { status: 'active', role: 'admin' },
      { status: 'active', area_id: null },
      { status: 'active', email: `sequestrado-${stamp}@gexcorp.com.br` },
    ] as const

    for (const alteracao of tentativas) {
      const { error } = await asInvitedUser.from('profiles').update(alteracao).eq('id', userId)
      expect(error, `deveria recusar a alteração ${JSON.stringify(alteracao)}`).not.toBeNull()
    }

    // WITH CHECK falhando derruba o UPDATE inteiro: a linha continua intocada.
    const { data: aindaConvidado, error: leituraError } = await db
      .from('profiles')
      .select('status, role, area_id, email')
      .eq('id', userId)
      .single()
    if (leituraError) throw leituraError
    expect(aindaConvidado).toMatchObject({
      status: 'invited',
      role: 'member',
      area_id: area!.id,
      email,
    })

    const ativacaoSimples = await asInvitedUser
      .from('profiles')
      .update({ status: 'active' })
      .eq('id', userId)
    expect(ativacaoSimples.error).toBeNull()

    const { data: agoraAtivo, error: leituraFinalError } = await db
      .from('profiles')
      .select('status, role, area_id, email')
      .eq('id', userId)
      .single()
    if (leituraFinalError) throw leituraFinalError
    expect(agoraAtivo).toMatchObject({
      status: 'active',
      role: 'member',
      area_id: area!.id,
      email,
    })
  })
})
