import { describe, expect, it } from 'vitest'
import { adminClient, authClient, createTestUser } from './client'

const db = adminClient()

describe('tabela areas', () => {
  it('impede duas áreas com o mesmo slug', async () => {
    const slug = `design-${Date.now()}`
    const primeira = await db.from('areas').insert({ name: 'Design', slug })
    expect(primeira.error).toBeNull()

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
    await createTestUser({ email: memberEmail, fullName: 'Membro de Teste', role: 'member' })
    await createTestUser({ email: leaderEmail, fullName: 'Líder de Teste', role: 'leader' })
    await createTestUser({ email: adminEmail, fullName: 'Admin de Teste', role: 'admin' })

    const { data: fixture, error: fixtureError } = await db
      .from('areas')
      .insert({ name: 'Fixture Escrita', slug: `fixture-escrita-${stamp}` })
      .select('id, name')
      .single()
    expect(fixtureError).toBeNull()

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
    expect(adminInsert.error).toBeNull()
  })
})
