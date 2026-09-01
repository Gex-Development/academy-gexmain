import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminClient, authClient, createTestUser, criarLixeira } from './client'

// Prova, contra o Postgres de verdade, três comportamentos de
// src/server/progress.ts que dependem inteiramente de RLS + o embed
// `lessons!inner(...)` (novo nesta tarefa — nenhum outro arquivo do projeto
// usava `!inner` antes dela) para se sustentar. As três consultas abaixo são
// as MESMAS strings usadas em produção (getCompletedLessonIds,
// getContinueWatching, e o agrupamento de concluidasPorCurso em
// src/server/catalog.ts) — não uma reimplementação paralela: se
// lessons_leitura, courses_leitura ou o comportamento de embed do PostgREST
// mudarem, é esta consulta que precisa continuar se comportando assim, então
// é ela que o teste roda.
const db = adminClient()
const lixeira = criarLixeira()

let areaId: string
let liderId: string
let emailLider: string
let membroId: string
let emailMembro: string

beforeAll(async () => {
  const stamp = Date.now()

  const { data: area, error: areaError } = await db
    .from('areas')
    .insert({ name: 'Progresso DB', slug: `progresso-db-${stamp}` })
    .select('id')
    .single()
  if (areaError) throw areaError
  areaId = area!.id
  lixeira.area(areaId)

  emailLider = `lider-progresso-${stamp}@gexcorp.com.br`
  liderId = await createTestUser({ email: emailLider, fullName: 'Líder Progresso', role: 'leader', areaId })
  lixeira.usuario(liderId)

  emailMembro = `membro-progresso-${stamp}@gexcorp.com.br`
  membroId = await createTestUser({ email: emailMembro, fullName: 'Membro Progresso', role: 'member', areaId })
  lixeira.usuario(membroId)
})

afterAll(() => lixeira.limpar())

describe('getContinueWatching — a consulta some quando o acesso ao curso é revogado', () => {
  it('acesso concedido individualmente, progresso registrado, acesso revogado: a sugestão desaparece', async () => {
    const stamp = Date.now()

    // Membro de área diferente da do curso — só enxerga o curso via
    // course_access, não por área. É o cenário mais direto para revogar:
    // apagar a linha de course_access sem mexer no curso em si.
    const { data: areaOutra, error: areaOutraError } = await db
      .from('areas')
      .insert({ name: 'Progresso Fora', slug: `progresso-fora-${stamp}` })
      .select('id')
      .single()
    if (areaOutraError) throw areaOutraError
    lixeira.area(areaOutra!.id)

    const emailForasteiro = `forasteiro-progresso-${stamp}@gexcorp.com.br`
    const forasteiroId = await createTestUser({
      email: emailForasteiro,
      fullName: 'Forasteiro Progresso',
      role: 'member',
      areaId: areaOutra!.id,
    })
    lixeira.usuario(forasteiroId)

    const { data: curso, error: cursoError } = await db
      .from('courses')
      .insert({
        title: 'Curso Revogação',
        slug: `curso-revogacao-${stamp}`,
        area_id: areaId,
        owner_id: liderId,
        status: 'published',
      })
      .select('id')
      .single()
    if (cursoError) throw cursoError
    lixeira.curso(curso!.id)

    const { data: lesson, error: lessonError } = await db
      .from('lessons')
      .insert({
        course_id: curso!.id,
        title: 'Aula Revogação',
        slug: 'aula-revogacao',
        video_provider: 'youtube',
        video_ref: 'dQw4w9WgXcQ',
        status: 'published',
      })
      .select('id')
      .single()
    if (lessonError) throw lessonError

    const { error: liberaError } = await db
      .from('course_access')
      .insert({ user_id: forasteiroId, course_id: curso!.id, granted_by: liderId })
    if (liberaError) throw liberaError

    const { error: progressoError } = await db
      .from('lesson_progress')
      .insert({ user_id: forasteiroId, lesson_id: lesson!.id })
    if (progressoError) throw progressoError

    const { error: revogaError } = await db
      .from('course_access')
      .delete()
      .eq('user_id', forasteiroId)
      .eq('course_id', curso!.id)
    if (revogaError) throw revogaError

    // Controle: a linha de progresso continua no banco — USING de
    // progresso_proprio só exige "é minha linha", não acesso ao curso.
    const { data: linhaAindaExiste } = await db
      .from('lesson_progress')
      .select('lesson_id')
      .eq('user_id', forasteiroId)
      .eq('lesson_id', lesson!.id)
    expect(linhaAindaExiste).toHaveLength(1)

    // A mesma consulta de getContinueWatching, autenticado como o forasteiro
    // (RLS real valendo, chave publicável).
    const cliente = await authClient(emailForasteiro)
    const { data: ultima, error } = await cliente
      .from('lesson_progress')
      .select('completed_at, lessons!inner(course_id, courses!inner(slug))')
      .eq('user_id', forasteiroId)
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    expect(error).toBeNull()
    expect(ultima).toBeNull()
  })
})

describe('getContinueWatching — a consulta some quando o curso é despublicado', () => {
  it('colega da mesma área perde a sugestão assim que o curso vira rascunho', async () => {
    const stamp = Date.now()

    const { data: curso, error: cursoError } = await db
      .from('courses')
      .insert({
        title: 'Curso Despublicado',
        slug: `curso-despublicado-${stamp}`,
        area_id: areaId,
        owner_id: liderId,
        status: 'published',
      })
      .select('id')
      .single()
    if (cursoError) throw cursoError
    lixeira.curso(curso!.id)

    const { data: lesson, error: lessonError } = await db
      .from('lessons')
      .insert({
        course_id: curso!.id,
        title: 'Aula Despublicada',
        slug: 'aula-despublicada',
        video_provider: 'youtube',
        video_ref: 'dQw4w9WgXcQ',
        status: 'published',
      })
      .select('id')
      .single()
    if (lessonError) throw lessonError

    // membroId é da MESMA área do curso: acesso vem da regra 6
    // (canAccessCourse), não de course_access — por isso despublicar o curso
    // (regra 4, avaliada antes da 6) é o jeito certo de revogar aqui.
    const { error: progressoError } = await db
      .from('lesson_progress')
      .insert({ user_id: membroId, lesson_id: lesson!.id })
    if (progressoError) throw progressoError

    const { error: despublicaError } = await db.from('courses').update({ status: 'draft' }).eq('id', curso!.id)
    if (despublicaError) throw despublicaError

    const cliente = await authClient(emailMembro)
    const { data: ultima, error } = await cliente
      .from('lesson_progress')
      .select('completed_at, lessons!inner(course_id, courses!inner(slug))')
      .eq('user_id', membroId)
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    expect(error).toBeNull()
    expect(ultima).toBeNull()

    // Restaura para não interferir com o teste seguinte se a ordem mudar —
    // e para o afterAll conseguir apagar o curso sem surpresa de estado.
    const { error: republicaError } = await db.from('courses').update({ status: 'published' }).eq('id', curso!.id)
    if (republicaError) throw republicaError
  })
})

describe('contagem de concluídas quando uma aula concluída é despublicada depois', () => {
  it('gestor do curso continua contando a aula em rascunho; colega comum não — completed pode passar de total', async () => {
    const stamp = Date.now()

    const { data: curso, error: cursoError } = await db
      .from('courses')
      .insert({
        title: 'Curso Aula Despublicada',
        slug: `curso-aula-despublicada-${stamp}`,
        area_id: areaId,
        owner_id: liderId,
        status: 'published',
      })
      .select('id')
      .single()
    if (cursoError) throw cursoError
    lixeira.curso(curso!.id)

    const { data: lessons, error: lessonsError } = await db
      .from('lessons')
      .insert([
        {
          course_id: curso!.id,
          title: 'Aula 1 (vai virar rascunho)',
          slug: 'aula-1-despublica',
          video_provider: 'youtube',
          video_ref: 'dQw4w9WgXcQ',
          status: 'published',
        },
        {
          course_id: curso!.id,
          title: 'Aula 2 (continua publicada)',
          slug: 'aula-2-continua',
          video_provider: 'youtube',
          video_ref: 'dQw4w9WgXcQ',
          status: 'published',
        },
      ])
      .select('id, slug')
    if (lessonsError) throw lessonsError
    const aula1 = lessons!.find((l) => l.slug === 'aula-1-despublica')!.id
    const aula2 = lessons!.find((l) => l.slug === 'aula-2-continua')!.id

    // Líder (gestor do curso, própria área) conclui as DUAS aulas. Membro
    // (mesma área, sem gestão) conclui só a aula que vai ser despublicada.
    const { error: progressoError } = await db.from('lesson_progress').insert([
      { user_id: liderId, lesson_id: aula1 },
      { user_id: liderId, lesson_id: aula2 },
      { user_id: membroId, lesson_id: aula1 },
    ])
    if (progressoError) throw progressoError

    const { error: despublicaError } = await db.from('lessons').update({ status: 'draft' }).eq('id', aula1)
    if (despublicaError) throw despublicaError

    // Total "oficial" (a mesma RPC que alimenta lessonCount/progress.total no
    // catálogo): só conta aula publicada, então cai de 2 para 1 para todo
    // mundo, papel nenhum muda isso.
    const clienteLider = await authClient(emailLider)
    const { data: contagensLider } = await clienteLider.rpc('contar_aulas_publicadas')
    const totalParaLider = contagensLider?.find((c) => c.course_id === curso!.id)?.total ?? 0
    expect(Number(totalParaLider)).toBe(1)

    const clienteMembro = await authClient(emailMembro)
    const { data: contagensMembro } = await clienteMembro.rpc('contar_aulas_publicadas')
    const totalParaMembro = contagensMembro?.find((c) => c.course_id === curso!.id)?.total ?? 0
    expect(Number(totalParaMembro)).toBe(1)

    // Concluídas: a MESMA consulta de getCompletedLessonIds (e do agrupamento
    // concluidasPorCurso em catalog.ts).
    const { data: concluidasLider, error: erroLider } = await clienteLider
      .from('lesson_progress')
      .select('lesson_id, lessons!inner(course_id)')
      .eq('user_id', liderId)
      .eq('lessons.course_id', curso!.id)
    expect(erroLider).toBeNull()

    const { data: concluidasMembro, error: erroMembro } = await clienteMembro
      .from('lesson_progress')
      .select('lesson_id, lessons!inner(course_id)')
      .eq('user_id', membroId)
      .eq('lessons.course_id', curso!.id)
    expect(erroMembro).toBeNull()

    // O líder gerencia o curso (can_manage_course bypassa o filtro de status
    // em lessons_leitura), então continua vendo a linha da aula em rascunho:
    // as DUAS conclusões contam, mesmo com o total oficial em 1 — completed
    // (2) passa de total (1). É exatamente o caso que progressPercent(9, 8)
    // em percent.test.ts antecipa, e a UI clampa em 100% — mas o número cru
    // de "concluídas" fica inflado para quem gerencia.
    expect(new Set((concluidasLider ?? []).map((r) => r.lesson_id))).toEqual(new Set([aula1, aula2]))

    // O membro comum não gerencia o curso: lessons_leitura exige aula
    // publicada para ele, então a aula 1 (agora rascunho) some do join — a
    // conclusão que ele registrou de verdade não é mais contada, ainda que a
    // linha continue física no banco (controle abaixo com o client admin).
    expect(new Set((concluidasMembro ?? []).map((r) => r.lesson_id))).toEqual(new Set())

    const { data: linhaAindaExiste } = await db
      .from('lesson_progress')
      .select('lesson_id')
      .eq('user_id', membroId)
      .eq('lesson_id', aula1)
    expect(linhaAindaExiste).toHaveLength(1)
  })
})
