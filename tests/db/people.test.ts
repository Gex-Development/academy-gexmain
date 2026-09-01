import { describe, expect, it } from 'vitest'
import { adminClient, authClient, createTestUser } from './client'

const db = adminClient()

describe('perfis', () => {
  it('cria perfil de colaborador com status ativo e área', async () => {
    const stamp = Date.now()
    const { data: area } = await db
      .from('areas')
      .insert({ name: 'Copy', slug: `copy-${stamp}` })
      .select('id')
      .single()

    const id = await createTestUser({
      email: `copy-${stamp}@gexcorp.com.br`,
      fullName: 'Redator',
      role: 'member',
      areaId: area!.id,
    })

    const { data } = await db
      .from('profiles')
      .select('role, status, area_id')
      .eq('id', id)
      .single()

    expect(data).toMatchObject({ role: 'member', status: 'active', area_id: area!.id })
  })

  it('apaga o perfil junto com o usuário do auth', async () => {
    const stamp = Date.now()
    const id = await createTestUser({
      email: `temporario-${stamp}@gexcorp.com.br`,
      fullName: 'Temporário',
      role: 'member',
    })

    await db.auth.admin.deleteUser(id)

    const { data } = await db.from('profiles').select('id').eq('id', id).maybeSingle()
    expect(data).toBeNull()
  })

  it('zera a área do perfil quando a área é apagada', async () => {
    const stamp = Date.now()
    const { data: area } = await db
      .from('areas')
      .insert({ name: 'Efêmera', slug: `efemera-${stamp}` })
      .select('id')
      .single()

    const id = await createTestUser({
      email: `orfao-${stamp}@gexcorp.com.br`,
      fullName: 'Órfão',
      role: 'member',
      areaId: area!.id,
    })

    await db.from('areas').delete().eq('id', area!.id)

    const { data } = await db.from('profiles').select('area_id').eq('id', id).single()
    expect(data!.area_id).toBeNull()
  })
})

// Os testes acima usam service_role, que ignora RLS por completo — não provam
// nada sobre a política profiles_admin_escreve. Aqui autenticamos como membro,
// líder e admin de verdade: membro e líder precisam falhar ao tentar promover
// outra pessoa a admin, e o admin precisa ter sucesso onde os outros
// falharam — sem o caso de controle do admin, o teste só provaria "algo
// falhou", não que a política distingue por papel. E, como um update barrado
// pelo RLS pode não devolver erro nenhum e simplesmente não afetar linha
// nenhuma, a prova real é reler com o admin client, não só checar o retorno.
describe('RLS: escrita em profiles (profiles_admin_escreve)', () => {
  it('bloqueia troca de papel por quem não é admin; permite para admin', async () => {
    const stamp = Date.now()

    const memberEmail = `membro-profiles-${stamp}@gexcorp.com.br`
    const leaderEmail = `lider-profiles-${stamp}@gexcorp.com.br`
    const adminEmail = `admin-profiles-${stamp}@gexcorp.com.br`

    await createTestUser({ email: memberEmail, fullName: 'Membro RLS', role: 'member' })
    await createTestUser({ email: leaderEmail, fullName: 'Líder RLS', role: 'leader' })
    await createTestUser({ email: adminEmail, fullName: 'Admin RLS', role: 'admin' })

    const targetId = await createTestUser({
      email: `alvo-profiles-${stamp}@gexcorp.com.br`,
      fullName: 'Alvo RLS',
      role: 'member',
    })

    for (const [papel, email] of [
      ['membro', memberEmail],
      ['líder', leaderEmail],
    ] as const) {
      const asNaoAdmin = await authClient(email)

      await asNaoAdmin.from('profiles').update({ role: 'admin' }).eq('id', targetId)

      const { data: aindaMembro } = await db
        .from('profiles')
        .select('role')
        .eq('id', targetId)
        .single()
      expect(aindaMembro?.role, `${papel} não deveria conseguir promover outra pessoa`).toBe(
        'member',
      )
    }

    const asAdmin = await authClient(adminEmail)
    const { error: adminUpdateError } = await asAdmin
      .from('profiles')
      .update({ role: 'leader' })
      .eq('id', targetId)
    expect(adminUpdateError).toBeNull()

    const { data: atualizado } = await db
      .from('profiles')
      .select('role')
      .eq('id', targetId)
      .single()
    expect(atualizado?.role).toBe('leader')
  })
})

// A E2E "colaborador abre o próprio perfil" já prova o caminho permitido
// (nome e foto mudam) contra um navegador de verdade. O que falta — e é
// exatamente o que vira brecha de segurança se faltar — é provar o lado
// bloqueado: autenticado como a própria pessoa (não service_role, que ignora
// RLS por completo), nenhuma tentativa de embutir role, status, area_id ou
// email numa autoedição pode passar. Um update barrado pelo RLS pode devolver
// sucesso com zero linhas afetadas — por isso a prova real é reler com o
// admin client, não só checar o retorno do update.
describe('RLS: edição do próprio perfil (profiles_edita_o_proprio)', () => {
  it('recusa autoedição que muda role, status, area_id ou email; permite nome e foto', async () => {
    const stamp = Date.now()

    const { data: area } = await db
      .from('areas')
      .insert({ name: 'Edição Própria', slug: `edicao-propria-${stamp}` })
      .select('id')
      .single()

    const email = `autoedicao-${stamp}@gexcorp.com.br`
    const userId = await createTestUser({
      email,
      fullName: 'Autoedição de Teste',
      role: 'member',
      areaId: area!.id,
    })

    const asSelf = await authClient(email)

    // Cada tentativa isolada, para provar que cada coluna fixada barra
    // sozinha — não só a combinação delas.
    const tentativas = [
      { role: 'admin' },
      { status: 'inactive' },
      { area_id: null },
      { email: `sequestrado-${stamp}@gexcorp.com.br` },
    ] as const

    for (const alteracao of tentativas) {
      const { error } = await asSelf.from('profiles').update(alteracao).eq('id', userId)
      expect(error, `deveria recusar a alteração ${JSON.stringify(alteracao)}`).not.toBeNull()
    }

    const { data: aindaOriginal } = await db
      .from('profiles')
      .select('role, status, area_id, email')
      .eq('id', userId)
      .single()
    expect(aindaOriginal).toMatchObject({
      role: 'member',
      status: 'active',
      area_id: area!.id,
      email,
    })

    // Controle: nome e foto, sem tocar nas colunas fixadas, têm que passar —
    // sem isto o teste só provaria "a política bloqueia tudo", não que ela
    // distingue as colunas.
    const { error: okError } = await asSelf
      .from('profiles')
      .update({ full_name: 'Nome Atualizado', avatar_url: 'https://exemplo.com/foto.jpg' })
      .eq('id', userId)
    expect(okError).toBeNull()

    const { data: atualizado } = await db
      .from('profiles')
      .select('full_name, avatar_url')
      .eq('id', userId)
      .single()
    expect(atualizado).toMatchObject({
      full_name: 'Nome Atualizado',
      avatar_url: 'https://exemplo.com/foto.jpg',
    })
  })
})

// Prova o trigger profiles_exige_admin (invariante do banco: sempre existe ao
// menos um admin ativo). A invariante é global à tabela inteira — não dá para
// isolar "o admin do meu teste" dos admins deixados ativos por outros
// arquivos/execuções anteriores. Por isso o teste primeiro neutraliza
// (desativa) qualquer outro admin ativo que já exista, garantindo o cenário
// "só existe um admin" de verdade, e devolve todos ao estado original ao
// final — mesmo se uma asserção falhar no meio do caminho.
describe('invariante: sempre existe ao menos um admin ativo (profiles_exige_admin)', () => {
  it('bloqueia rebaixar/desativar o último admin ativo; permite quando há outro', async () => {
    const stamp = Date.now()

    const soloAdminId = await createTestUser({
      email: `admin-solo-${stamp}@gexcorp.com.br`,
      fullName: 'Admin Solo',
      role: 'admin',
    })

    // Com o admin solo já ativo, sempre sobra ao menos um admin ativo durante
    // a limpeza abaixo — nenhuma dessas desativações esbarra na invariante.
    const { data: outrosAdmins } = await db
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
      .eq('status', 'active')
      .neq('id', soloAdminId)

    const idsParaRestaurar = (outrosAdmins ?? []).map((p) => p.id)

    try {
      for (const id of idsParaRestaurar) {
        const { error } = await db.from('profiles').update({ status: 'inactive' }).eq('id', id)
        expect(error).toBeNull()
      }

      // Cenário: só o admin solo está ativo. Rebaixar o papel dele precisa falhar.
      const { error: rebaixarError } = await db
        .from('profiles')
        .update({ role: 'member' })
        .eq('id', soloAdminId)
      expect(rebaixarError?.code).toBe('GX001')
      expect(rebaixarError?.message).toBe(
        'A plataforma precisa de ao menos um administrador ativo.',
      )

      const { data: aindaAdmin } = await db
        .from('profiles')
        .select('role, status')
        .eq('id', soloAdminId)
        .single()
      expect(aindaAdmin).toMatchObject({ role: 'admin', status: 'active' })

      // Desativar (sem trocar o papel) também precisa falhar, pelo mesmo motivo.
      const { error: desativarError } = await db
        .from('profiles')
        .update({ status: 'inactive' })
        .eq('id', soloAdminId)
      expect(desativarError?.code).toBe('GX001')

      const { data: aindaAtivo } = await db
        .from('profiles')
        .select('status')
        .eq('id', soloAdminId)
        .single()
      expect(aindaAtivo?.status).toBe('active')

      // Controle: com um segundo admin ativo, rebaixar o primeiro tem que
      // funcionar — isso é o que prova que o trigger discrimina pela
      // contagem, em vez de bloquear qualquer mudança.
      await createTestUser({
        email: `admin-segundo-${stamp}@gexcorp.com.br`,
        fullName: 'Admin Segundo',
        role: 'admin',
      })

      const { error: rebaixarComParError } = await db
        .from('profiles')
        .update({ role: 'member' })
        .eq('id', soloAdminId)
      expect(rebaixarComParError).toBeNull()

      const { data: rebaixado } = await db
        .from('profiles')
        .select('role')
        .eq('id', soloAdminId)
        .single()
      expect(rebaixado?.role).toBe('member')
    } finally {
      // Reativar nunca esbarra no trigger (só bloqueia quem estava ativo
      // deixando de ser admin/ativo) — sempre seguro de rodar, mesmo se uma
      // asserção acima já tiver falhado.
      for (const id of idsParaRestaurar) {
        await db.from('profiles').update({ status: 'active' }).eq('id', id)
      }
    }
  })
})
