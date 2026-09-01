import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { paraManagedCourse, podePublicar, SELECT_CURSO, type LinhaCurso } from '@/server/courses-query'
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

// setCourseStatus recusa publicar um curso com zero aulas publicadas — regra
// só de aplicação, sem constraint nem trigger que a espelhe no banco (a
// própria migration 0001/0003 não tem nada que impeça courses.status =
// 'published' com zero lessons publicadas). Nada exercitava isso.
//
// Chamar setCourseStatus() diretamente não é viável aqui: ela depende de
// createServerSupabase(), que lê cookies() de 'next/headers' — fora de um
// request Next.js de verdade isso lança "cookies was called outside a
// request scope" (confirmado experimentalmente). Por isso o teste roda a
// MESMA consulta (SELECT_CURSO) e o MESMO mapeamento (paraManagedCourse) que
// a action usa, contra o Postgres de verdade, e decide com a MESMA função
// (podePublicar) que setCourseStatus chama — as três foram exportadas de
// src/server/courses-query.ts exatamente para isto. Reimplementar a conta de
// "aulas publicadas" aqui em vez de importar a função real provaria a
// suposição do teste, não o código de produção — é exatamente o tipo de
// regressão silenciosa contra a qual isto precisa proteger.
describe('regra de publicação: nunca com zero aulas publicadas', () => {
  it('curso sem nenhuma aula não pode ser publicado', async () => {
    const { data: course } = await db
      .from('courses')
      .insert({
        title: 'Curso sem aulas',
        slug: `sem-aulas-${Date.now()}`,
        area_id: areaTrafego,
        owner_id: ownerId,
      })
      .select('id')
      .single()
    lixeira.curso(course!.id)

    const { data: row, error } = await db
      .from('courses')
      .select(SELECT_CURSO)
      .eq('id', course!.id)
      .single()
    expect(error).toBeNull()

    const curso = paraManagedCourse(row as unknown as LinhaCurso)
    expect(curso.lessonCount).toBe(0)
    expect(curso.publishedLessonCount).toBe(0)
    expect(podePublicar(curso)).toBe(false)
  })

  it('curso cuja única aula está em rascunho não pode ser publicado; publicando a aula, publicar o curso passa a valer', async () => {
    // Este é o caso que importa: um "lessons.length > 0" ingênuo (contar
    // aulas em vez de aulas PUBLICADAS) deixaria passar — lessonCount é 1
    // aqui, mas publishedLessonCount tem que continuar 0.
    const { data: course } = await db
      .from('courses')
      .insert({
        title: 'Curso com aula em rascunho',
        slug: `aula-rascunho-${Date.now()}`,
        area_id: areaTrafego,
        owner_id: ownerId,
      })
      .select('id')
      .single()
    lixeira.curso(course!.id)

    const { data: lesson } = await db
      .from('lessons')
      .insert({
        course_id: course!.id,
        title: 'Aula 1',
        slug: 'aula-1',
        video_provider: 'youtube',
        video_ref: 'dQw4w9WgXcQ',
        status: 'draft',
      })
      .select('id')
      .single()

    const { data: rowAntes } = await db
      .from('courses')
      .select(SELECT_CURSO)
      .eq('id', course!.id)
      .single()
    const cursoAntes = paraManagedCourse(rowAntes as unknown as LinhaCurso)
    expect(cursoAntes.lessonCount).toBe(1)
    expect(cursoAntes.publishedLessonCount).toBe(0)
    expect(podePublicar(cursoAntes)).toBe(false)

    // Controle: publicando a aula, a mesma regra passa a permitir publicar o
    // curso — prova que ela reage à contagem real, e não bloqueia sempre.
    await db.from('lessons').update({ status: 'published' }).eq('id', lesson!.id)

    const { data: rowDepois } = await db
      .from('courses')
      .select(SELECT_CURSO)
      .eq('id', course!.id)
      .single()
    const cursoDepois = paraManagedCourse(rowDepois as unknown as LinhaCurso)
    expect(cursoDepois.publishedLessonCount).toBe(1)
    expect(podePublicar(cursoDepois)).toBe(true)
  })
})
