import 'server-only'
import { cache } from 'react'
import { createServerSupabase } from '@/lib/supabase/server'
import type { AccessUser, Role, UserStatus } from '@/lib/access'

export type CurrentUser = AccessUser & {
  fullName: string
  email: string
  avatarUrl: string | null
}

/**
 * Usuário da requisição atual, com o perfil já carregado.
 * Memoizado por requisição com `cache`, para não consultar o banco em cada
 * componente que precisa saber quem está logado.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createServerSupabase()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, email, avatar_url, role, area_id, status')
    .eq('id', user.id)
    .single()
  if (!profile) return null

  return {
    id: profile.id,
    role: profile.role as Role,
    status: profile.status as UserStatus,
    areaId: profile.area_id,
    fullName: profile.full_name,
    email: profile.email,
    avatarUrl: profile.avatar_url,
  }
})
