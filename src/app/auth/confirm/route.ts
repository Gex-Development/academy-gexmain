import { redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * Recebe o link do e-mail (convite ou recuperação de senha), troca o token por
 * uma sessão e leva a pessoa para a tela de definir senha.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? '/convite'

  if (!token_hash || !type) redirect('/login?erro=link-invalido')

  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.verifyOtp({ type, token_hash })

  if (error) redirect('/login?erro=link-expirado')
  redirect(next)
}
