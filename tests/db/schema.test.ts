import { beforeAll, describe, expect, it } from 'vitest'
import { adminClient, createTestUser } from './client'

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
    const first = await db.from('courses').insert({
      title: 'Trilha Inicial',
      slug: `trilha-a-${Date.now()}`,
      is_onboarding: true,
      area_id: null,
      owner_id: ownerId,
    })
    expect(first.error).toBeNull()

    const { error } = await db.from('courses').insert({
      title: 'Outra Trilha Inicial',
      slug: `trilha-b-${Date.now()}`,
      is_onboarding: true,
      area_id: null,
      owner_id: ownerId,
    })
    expect(error?.message).toContain('courses_uma_trilha_inicial')

    // Libera o índice único para os testes seguintes deste arquivo.
    await db.from('courses').delete().like('slug', 'trilha-a-%')
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
