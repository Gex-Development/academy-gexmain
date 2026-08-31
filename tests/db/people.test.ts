import { describe, expect, it } from 'vitest'
import { adminClient, createTestUser } from './client'

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
