import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminClient, createTestUser, criarLixeira } from './client'

const db = adminClient()
const lixeira = criarLixeira()
let areaTrafego: string
let ownerId: string

beforeAll(async () => {
  const stamp = Date.now()
  const { data } = await db
    .from('areas')
    .insert({ name: 'Tráfego', slug: `trafego-c-${stamp}` })
    .select('id')
    .single()
  areaTrafego = data!.id
  lixeira.area(areaTrafego)
  ownerId = await createTestUser({
    email: `dono-curso-${stamp}@gexcorp.com.br`,
    fullName: 'Dono do Curso',
    role: 'leader',
    areaId: areaTrafego,
  })
  lixeira.usuario(ownerId)
})

afterAll(() => lixeira.limpar())

describe('cursos', () => {
  it('apaga as aulas junto com o curso', async () => {
    const { data: course } = await db
      .from('courses')
      .insert({
        title: 'Curso descartável',
        slug: `descartavel-${Date.now()}`,
        area_id: areaTrafego,
        owner_id: ownerId,
      })
      .select('id')
      .single()
    // Registrado mesmo sendo apagado abaixo pelo próprio teste: ao contrário
    // de deleteUser, apagar um curso já inexistente não gera erro — não há
    // risco de limpar() falhar por causa disso.
    lixeira.curso(course!.id)

    await db.from('lessons').insert({
      course_id: course!.id,
      title: 'Aula 1',
      slug: 'aula-1',
      video_provider: 'youtube',
      video_ref: 'dQw4w9WgXcQ',
    })

    await db.from('courses').delete().eq('id', course!.id)

    const { data: aulas } = await db.from('lessons').select('id').eq('course_id', course!.id)
    expect(aulas).toEqual([])
  })

  it('impede duas aulas com o mesmo slug no mesmo curso', async () => {
    const { data: course } = await db
      .from('courses')
      .insert({
        title: 'Curso com slugs',
        slug: `slugs-${Date.now()}`,
        area_id: areaTrafego,
        owner_id: ownerId,
      })
      .select('id')
      .single()
    lixeira.curso(course!.id)

    const base = {
      course_id: course!.id,
      title: 'Introdução',
      slug: 'introducao',
      video_provider: 'youtube' as const,
      video_ref: 'dQw4w9WgXcQ',
    }
    expect((await db.from('lessons').insert(base)).error).toBeNull()
    expect((await db.from('lessons').insert(base)).error?.code).toBe('23505')
  })

  it('permite o mesmo slug de aula em cursos diferentes', async () => {
    const stamp = Date.now()
    const cursos = await db
      .from('courses')
      .insert([
        { title: 'A', slug: `a-${stamp}`, area_id: areaTrafego, owner_id: ownerId },
        { title: 'B', slug: `b-${stamp}`, area_id: areaTrafego, owner_id: ownerId },
      ])
      .select('id')

    for (const curso of cursos.data!) lixeira.curso(curso.id)

    for (const curso of cursos.data!) {
      const { error } = await db.from('lessons').insert({
        course_id: curso.id,
        title: 'Introdução',
        slug: 'introducao',
        video_provider: 'youtube',
        video_ref: 'dQw4w9WgXcQ',
      })
      expect(error).toBeNull()
    }
  })

  it('recusa provedor de vídeo desconhecido', async () => {
    const { data: course } = await db
      .from('courses')
      .insert({
        title: 'Curso provedor',
        slug: `provedor-${Date.now()}`,
        area_id: areaTrafego,
        owner_id: ownerId,
      })
      .select('id')
      .single()
    lixeira.curso(course!.id)

    // 'video_provider' é texto com check constraint no banco, não um enum do
    // Postgres — o mesmo caso de 'role' documentado em schema.test.ts. O
    // gerador de tipos do Supabase não promove checks para union types
    // (supabase/cli#1433), então esta string inválida passa pelo TypeScript
    // e só é barrada em tempo de execução, pelo banco.
    const { error } = await db.from('lessons').insert({
      course_id: course!.id,
      title: 'Aula',
      slug: 'aula',
      video_provider: 'vimeo',
      video_ref: 'x',
    })
    expect(error?.message).toContain('lessons_video_provider_check')
  })
})
