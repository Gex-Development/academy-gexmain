import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types'

/** Cliente do navegador. Usado apenas para login, logout e troca de senha. */
export function createBrowserSupabase() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )
}
