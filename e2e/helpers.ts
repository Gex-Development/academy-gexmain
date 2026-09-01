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
 * Cria uma pessoa já com senha, pulando o e-mail de convite: os testes deste
 * arquivo cobrem o app a partir de uma sessão já autenticada, não o link do
 * e-mail em si.
 *
 * O fluxo do link (token_hash trocado por sessão em /auth/confirm) NÃO tem
 * cobertura automatizada — nem aqui, nem em nenhum outro lugar da suíte, que
 * roda contra o projeto Supabase remoto de desenvolvimento, sem Inbucket
 * local. Ele depende do template de e-mail configurado no painel do Supabase
 * incluir `token_hash`; ver a nota em src/app/auth/confirm/route.ts.
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

  const { error: profileError } = await db.from('profiles').insert({
    id: data.user.id,
    full_name: input.fullName,
    email: input.email,
    role: input.role,
    area_id: input.areaId ?? null,
    status: input.status ?? 'active',
  })
  // Sem checar isto, um fixture que falhou silenciosamente vira, mais tarde,
  // um timeout confuso de locator do Playwright (a página nunca chega ao
  // estado esperado porque o perfil nunca existiu) — em vez de apontar direto
  // para a causa. Mesmo tratamento de tests/db/client.ts:39.
  if (profileError) throw profileError

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
