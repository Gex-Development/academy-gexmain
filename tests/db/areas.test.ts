import { afterAll, describe, expect, it } from 'vitest'
import { adminClient, authClient, createTestUser, criarLixeira } from './client'

const db = adminClient()
const lixeira = criarLixeira()

afterAll(() => lixeira.limpar())

describe('tabela areas', () => {
  it('impede duas áreas com o mesmo slug', async () => {
    const slug = `design-${Date.now()}`
    const primeira = await db.from('areas').insert({ name: 'Design', slug }).select('id').single()
    expect(primeira.error).toBeNull()
    lixeira.area(primeira.data!.id)

    const { error } = await db.from('areas').insert({ name: 'Design', slug })
    expect(error?.code).toBe('23505')
  })

  // A linha é inserida dentro do próprio teste (em vez de contar com a inserção
  // do teste anterior) para que a asserção continue provando algo mesmo rodada
  // sozinha, ou contra uma tabela recém-resetada: primeiro confirma, com o
  // cliente que ignora RLS, que a linha existe de verdade; só depois confirma
  // que o cliente anônimo não a enxerga.
  it('bloqueia leitura sem sessão porque o RLS está ligado', async () => {
    const slug = `leitura-anonima-${Date.now()}`
    const { data: fixture, error: fixtureError } = await db
      .from('areas')
      .insert({ name: 'Leitura Anônima', slug })
      .select('id')
      .single()
    expect(fixtureError).toBeNull()
    lixeira.area(fixture!.id)

    const { data: viaAdmin } = await db.from('areas').select('id').eq('id', fixture!.id)
    expect(viaAdmin).toEqual([{ id: fixture!.id }])

    const { createClient } = await import('@supabase/supabase-js')
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false } },
    )
    const { data: viaAnon } = await anon.from('areas').select('id').eq('id', fixture!.id)
    expect(viaAnon).toEqual([])
  })
})

// Todos os testes acima usam service_role, que ignora RLS por completo — não provam
// nada sobre a política areas_escrita. Aqui autenticamos como membro, líder e admin de
// verdade: membro e líder precisam falhar em insert e update, e o admin precisa ter
// sucesso onde os outros falharam — sem o caso de controle do admin, o teste só provaria
// "algo falhou", não que a política distingue por papel.
describe('RLS: escrita em areas (areas_escrita)', () => {
  it('bloqueia insert e update de quem não é admin; permite insert de admin', async () => {
    const stamp = Date.now()

    const memberEmail = `membro-areas-${stamp}@gexcorp.com.br`
    const leaderEmail = `lider-areas-${stamp}@gexcorp.com.br`
    const adminEmail = `admin-areas-${stamp}@gexcorp.com.br`
    lixeira.usuario(
      await createTestUser({ email: memberEmail, fullName: 'Membro de Teste', role: 'member' }),
    )
    lixeira.usuario(
      await createTestUser({ email: leaderEmail, fullName: 'Líder de Teste', role: 'leader' }),
    )
    lixeira.usuario(
      await createTestUser({ email: adminEmail, fullName: 'Admin de Teste', role: 'admin' }),
    )

    const { data: fixture, error: fixtureError } = await db
      .from('areas')
      .insert({ name: 'Fixture Escrita', slug: `fixture-escrita-${stamp}` })
      .select('id, name')
      .single()
    expect(fixtureError).toBeNull()
    lixeira.area(fixture!.id)

    for (const [papel, email] of [
      ['membro', memberEmail],
      ['líder', leaderEmail],
    ] as const) {
      const asNaoAdmin = await authClient(email)

      const insert = await asNaoAdmin
        .from('areas')
        .insert({ name: `Área criada por ${papel}`, slug: `${papel}-${stamp}` })
      expect(insert.error).not.toBeNull()

      // Um update barrado pelo RLS pode não devolver erro nenhum e simplesmente não
      // afetar linha alguma — por isso a prova real é reler com o admin client e
      // confirmar que o valor não mudou, e não só checar o retorno do update.
      await asNaoAdmin
        .from('areas')
        .update({ name: `Nome alterado por ${papel}` })
        .eq('id', fixture!.id)

      const { data: aindaIntacta } = await db
        .from('areas')
        .select('name')
        .eq('id', fixture!.id)
        .single()
      expect(aindaIntacta?.name).toBe('Fixture Escrita')
    }

    const asAdmin = await authClient(adminEmail)
    const adminInsert = await asAdmin
      .from('areas')
      .insert({ name: 'Área criada por admin', slug: `admin-${stamp}` })
      .select('id')
      .single()
    expect(adminInsert.error).toBeNull()
    lixeira.area(adminInsert.data!.id)
  })
})

// Spec §13 exige revogação imediata. O único teste existente para pessoa
// desativada é E2E ("pessoa desativada vê o aviso") e só prova que a tela
// mostra um aviso — não que o banco de fato corta o acesso. areas_leitura
// (0001) exige auth_is_active(); aqui provamos isso na camada de RLS, direto,
// com uma pessoa ativa da mesma área como controle — sem o controle, o teste
// só provaria "a pessoa inativa não viu nada", que também aconteceria se a
// política de leitura estivesse quebrada para todo mundo.
describe('RLS: corte imediato de pessoa inativa (auth_is_active)', () => {
  it('pessoa inativa não lê nada de areas; pessoa ativa da mesma área lê normalmente', async () => {
    const stamp = Date.now()

    const { data: area } = await db
      .from('areas')
      .insert({ name: 'Corte Inativo', slug: `corte-inativo-${stamp}` })
      .select('id')
      .single()
    lixeira.area(area!.id)

    const inactiveEmail = `inativo-corte-${stamp}@gexcorp.com.br`
    const activeEmail = `ativo-corte-${stamp}@gexcorp.com.br`
    lixeira.usuario(
      await createTestUser({
        email: inactiveEmail,
        fullName: 'Inativo Corte',
        role: 'member',
        areaId: area!.id,
        status: 'inactive',
      }),
    )
    lixeira.usuario(
      await createTestUser({
        email: activeEmail,
        fullName: 'Ativo Corte',
        role: 'member',
        areaId: area!.id,
        status: 'active',
      }),
    )

    // status é campo de aplicação, não bloqueia o login no Supabase Auth em
    // si — quem barra é a política de RLS, via auth_is_active(). Por isso o
    // signInWithPassword abaixo tem sucesso normalmente; o corte acontece na
    // consulta seguinte.
    const asInactive = await authClient(inactiveEmail)
    const { data: leituraInativo, error: erroInativo } = await asInactive
      .from('areas')
      .select('id')
    expect(erroInativo).toBeNull()
    expect(leituraInativo).toEqual([])

    const asActive = await authClient(activeEmail)
    const { data: leituraAtivo, error: erroAtivo } = await asActive
      .from('areas')
      .select('id')
      .eq('id', area!.id)
    expect(erroAtivo).toBeNull()
    expect(leituraAtivo).toEqual([{ id: area!.id }])
  })
})
