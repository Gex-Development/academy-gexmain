import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canAccessCourse, type AccessCourse, type AccessUser } from '@/lib/access'
import { adminClient, authClient, createTestUser, criarLixeira } from './client'

// Prova de paridade entre as duas cópias da regra de autorização: a função
// TypeScript pura (canAccessCourse, src/lib/access/can-access-course.ts) e a
// função SQL security definer (can_access_course, supabase/migrations/
// 0007_endurece_funcoes_security_definer.sql). O comentário no topo de
// can-access-course.ts afirma que a política RLS "espelha exatamente esta
// ordem" — mas até este arquivo, nada além de revisão manual garantia isso.
// O plano da fase pedia rodar os 23 casos de can-access-course.test.ts
// contra a função do banco e comparar um a um; isso nunca foi feito.
//
// auth.uid() não é parametrizável — a RPC sempre decide para quem está
// logado AGORA. Por isso o desenho aqui não é "rodar os 23 casos", e sim uma
// matriz fixa de usuários × cursos (um fixture por combinação distinta de
// estado de usuário e estado de curso) com um sign-in por usuário — a única
// forma de trocar de auth.uid() — e uma comparação ponto a ponto entre o
// boolean que a RPC devolve e o que canAccessCourse() calcula a partir do
// MESMO fixture, em TypeScript. Isso cobre exatamente as mesmas oito regras
// que os 23 casos exercitam (status, admin, líder da área, rascunho,
// trilha inicial, mesma área, liberação individual, bloqueio final), só que
// pela combinação de fixtures em vez de por parâmetro direto de função.
//
// Se qualquer par discordar, é um achado de verdade — as duas cópias da
// regra divergiram — não um teste para ajustar.
const db = adminClient()
const lixeira = criarLixeira()

let areaA: string
let areaB: string

type Papel =
  | 'admin'
  | 'leaderA'
  | 'leaderB'
  | 'memberA'
  | 'memberB'
  | 'inactiveMemberA'
  // SEM área principal, mas com área EXTRA em B (area_access). Sem área
  // própria, a única coisa que pode liberar o curso publicado de B é a regra
  // nova — se ela sumir do SQL ou do TypeScript, este é o par que discorda.
  | 'memberAreaExtraB'

type FixtureUsuario = { id: string; email: string; access: AccessUser }
const usuarios = {} as Record<Papel, FixtureUsuario>

type CursoChave = 'publicadoA' | 'rascunhoA' | 'publicadoB' | 'trilhaInicial' | 'liberadoIndividualB'

type FixtureCurso = { id: string; access: AccessCourse }
const cursos = {} as Record<CursoChave, FixtureCurso>

beforeAll(async () => {
  const stamp = Date.now()

  const { data: areas, error: areasError } = await db
    .from('areas')
    .insert([
      { name: 'Paridade A', slug: `paridade-a-${stamp}` },
      { name: 'Paridade B', slug: `paridade-b-${stamp}` },
    ])
    .select('id, slug')
  if (areasError) throw areasError
  areaA = areas!.find((a) => a.slug.startsWith('paridade-a'))!.id
  areaB = areas!.find((a) => a.slug.startsWith('paridade-b'))!.id
  lixeira.area(areaA)
  lixeira.area(areaB)

  const definicoesDeUsuario: {
    chave: Papel
    role: 'admin' | 'leader' | 'member'
    areaId: string | null
    status: 'active' | 'inactive'
  }[] = [
    { chave: 'admin', role: 'admin', areaId: null, status: 'active' },
    { chave: 'leaderA', role: 'leader', areaId: areaA, status: 'active' },
    { chave: 'leaderB', role: 'leader', areaId: areaB, status: 'active' },
    { chave: 'memberA', role: 'member', areaId: areaA, status: 'active' },
    { chave: 'memberB', role: 'member', areaId: areaB, status: 'active' },
    { chave: 'inactiveMemberA', role: 'member', areaId: areaA, status: 'inactive' },
    { chave: 'memberAreaExtraB', role: 'member', areaId: null, status: 'active' },
  ]

  for (const def of definicoesDeUsuario) {
    const email = `paridade-${def.chave.toLowerCase()}-${stamp}@gexcorp.com.br`
    const id = await createTestUser({
      email,
      fullName: `Paridade ${def.chave}`,
      role: def.role,
      areaId: def.areaId,
      status: def.status,
    })
    lixeira.usuario(id)
    usuarios[def.chave] = {
      id,
      email,
      access: { id, role: def.role, status: def.status, areaId: def.areaId },
    }
  }

  const donoId = usuarios.admin.id

  const definicoesDeCurso: {
    chave: CursoChave
    areaId: string | null
    status: 'draft' | 'published'
    isOnboarding: boolean
  }[] = [
    { chave: 'publicadoA', areaId: areaA, status: 'published', isOnboarding: false },
    { chave: 'rascunhoA', areaId: areaA, status: 'draft', isOnboarding: false },
    { chave: 'publicadoB', areaId: areaB, status: 'published', isOnboarding: false },
    { chave: 'trilhaInicial', areaId: null, status: 'published', isOnboarding: true },
    { chave: 'liberadoIndividualB', areaId: areaB, status: 'published', isOnboarding: false },
  ]

  for (const def of definicoesDeCurso) {
    const { data, error } = await db
      .from('courses')
      .insert({
        title: `Curso Paridade ${def.chave}`,
        slug: `paridade-curso-${def.chave.toLowerCase()}-${stamp}`,
        area_id: def.areaId,
        owner_id: donoId,
        status: def.status,
        is_onboarding: def.isOnboarding,
      })
      .select('id')
      .single()
    if (error) throw error
    lixeira.curso(data!.id)
    cursos[def.chave] = {
      id: data!.id,
      access: { id: data!.id, areaId: def.areaId, status: def.status, isOnboarding: def.isOnboarding },
    }
  }

  // Liberação individual: só memberA foi liberado no curso publicado de B —
  // é o caso que exercita o ramo "liberação individual" de canAccessCourse.
  const { error: grantError } = await db.from('course_access').insert({
    user_id: usuarios.memberA.id,
    course_id: cursos.liberadoIndividualB.id,
    granted_by: donoId,
  })
  if (grantError) throw grantError

  // Área extra: memberAreaExtraB recebe a ÁREA B inteira. Não tem área
  // principal nem liberação de curso, então tudo que ele acessar em B vem
  // desta linha — inclusive liberadoIndividualB, que é de B.
  const { error: areaGrantError } = await db.from('area_access').insert({
    user_id: usuarios.memberAreaExtraB.id,
    area_id: areaB,
    granted_by: donoId,
  })
  if (areaGrantError) throw areaGrantError
})

afterAll(() => lixeira.limpar())

describe('paridade: can_access_course (SQL) × canAccessCourse (TypeScript)', () => {
  const papeis: Papel[] = [
    'admin',
    'leaderA',
    'leaderB',
    'memberA',
    'memberB',
    'inactiveMemberA',
    'memberAreaExtraB',
  ]
  const cursosChaves: CursoChave[] = [
    'publicadoA',
    'rascunhoA',
    'publicadoB',
    'trilhaInicial',
    'liberadoIndividualB',
  ]

  for (const papel of papeis) {
    for (const cursoChave of cursosChaves) {
      it(`${papel} × ${cursoChave}`, async () => {
        const usuario = usuarios[papel]
        const curso = cursos[cursoChave]

        const cliente = await authClient(usuario.email)
        const { data, error } = await cliente.rpc('can_access_course', { p_course_id: curso.id })
        expect(error).toBeNull()

        // Só memberA tem liberação individual, e só no curso
        // liberadoIndividualB — mesmo fixture inserido no beforeAll.
        const liberados = new Set<string>(papel === 'memberA' ? [cursos.liberadoIndividualB.id] : [])
        // Mesmo fixture do beforeAll: só memberAreaExtraB tem área extra, e só a B.
        const areasExtras = new Set<string>(papel === 'memberAreaExtraB' ? [areaB] : [])
        const esperado =
          canAccessCourse(usuario.access, curso.access, liberados, areasExtras) !== 'none'

        expect(data, `RPC devolveu ${data}, TypeScript esperava ${esperado} (${papel} × ${cursoChave})`).toBe(
          esperado,
        )
      })
    }
  }
})
