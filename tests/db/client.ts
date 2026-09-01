import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

const SENHA_DE_TESTE = 'senha-de-teste-123'

/** Cliente com service_role: ignora RLS. Uso exclusivo de testes e seeds. */
export function adminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

/** Cria um usuário de auth com perfil e devolve o id. */
export async function createTestUser(input: {
  email: string
  fullName: string
  role: 'admin' | 'leader' | 'member'
  areaId?: string | null
  status?: 'invited' | 'active' | 'inactive'
}) {
  const db = adminClient()
  const { data, error } = await db.auth.admin.createUser({
    email: input.email,
    password: SENHA_DE_TESTE,
    email_confirm: true,
  })
  if (error || !data.user) throw error ?? new Error('usuário não criado')

  const { error: profileError } = await db.from('profiles').insert({
    id: data.user.id,
    full_name: input.fullName,
    email: input.email,
    role: input.role,
    area_id: input.areaId ?? null,
    status: input.status ?? 'active',
  })
  if (profileError) throw profileError

  return data.user.id
}

/**
 * Cliente autenticado como o usuário de teste indicado, com a chave publicável
 * (não a service_role): é o único jeito de exercitar RLS de verdade — um
 * cliente com service_role ignora as políticas por completo.
 */
export async function authClient(email: string, password = SENHA_DE_TESTE) {
  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw error
  return client
}

/**
 * Acumula os ids criados por um arquivo de teste e os remove no fim.
 *
 * Os testes rodam contra o projeto Supabase de verdade — o mesmo que os líderes
 * usam. Sem isso, cada execução deixa dezenas de usuários e áreas para trás.
 * A ordem de remoção importa: cursos antes de áreas (`courses.area_id` é
 * ON DELETE RESTRICT) e usuários por último (apagar `auth.users` derruba o
 * perfil em cascata).
 */
export function criarLixeira() {
  const cursos: string[] = []
  const areas: string[] = []
  const usuarios: string[] = []

  return {
    curso: (id: string) => cursos.push(id),
    area: (id: string) => areas.push(id),
    usuario: (id: string) => usuarios.push(id),
    async limpar() {
      const db = adminClient()
      for (const id of cursos) await db.from('courses').delete().eq('id', id)
      for (const id of areas) await db.from('areas').delete().eq('id', id)
      for (const id of usuarios) await db.auth.admin.deleteUser(id)
    },
  }
}
