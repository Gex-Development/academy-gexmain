import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

/**
 * Cliente com service_role: ignora RLS por completo.
 *
 * Só pode ser usado em operações administrativas que já verificaram o papel
 * do chamador (convidar pessoa, gerar link assinado, decidir solicitação).
 * O import de 'server-only' faz o build quebrar se este arquivo for puxado
 * para um componente de cliente.
 */
export function createAdminSupabase() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
