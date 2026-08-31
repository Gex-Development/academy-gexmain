import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

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
    password: 'senha-de-teste-123',
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
