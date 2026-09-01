import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local' })

export function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

/**
 * Cria uma pessoa já com senha, pulando o e-mail de convite.
 * O fluxo do link por e-mail é verificado à parte, no Inbucket local.
 */
export async function criarUsuarioDeTeste(input: {
  email: string
  senha: string
  fullName: string
  role: 'admin' | 'leader' | 'member'
  areaId?: string | null
  status?: 'invited' | 'active' | 'inactive'
}) {
  const db = adminClient()
  const { data, error } = await db.auth.admin.createUser({
    email: input.email,
    password: input.senha,
    email_confirm: true,
  })
  if (error || !data.user) throw error ?? new Error('usuário não criado')

  await db.from('profiles').insert({
    id: data.user.id,
    full_name: input.fullName,
    email: input.email,
    role: input.role,
    area_id: input.areaId ?? null,
    status: input.status ?? 'active',
  })

  return data.user.id
}

export async function criarAreaDeTeste(nome: string) {
  const db = adminClient()
  const { data, error } = await db
    .from('areas')
    .insert({ name: nome, slug: `${nome.toLowerCase()}-${Date.now()}` })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}
