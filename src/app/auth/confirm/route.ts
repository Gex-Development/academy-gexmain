import { redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * Recebe o link do e-mail (convite ou recuperação de senha), troca o token por
 * uma sessão e leva a pessoa para a tela de definir senha.
 *
 * IMPORTANTE — depende de configuração no painel do Supabase: o template de
 * e-mail (Authentication → Email Templates, "Invite user" e "Reset password")
 * precisa apontar para cá com `token_hash` no link, não `token` nem
 * `{{ .ConfirmationURL }}` puro — por exemplo:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/convite
 * Sem isso esta rota nunca recebe `token_hash`, cai em "link-invalido" e o
 * fluxo de primeiro acesso não funciona — troca de token por sessão nunca
 * chega a acontecer. Não verificado de ponta a ponta nesta tarefa: pendente
 * de conferência manual do template no painel.
 */

// Só os tipos que esta aplicação de fato emite: convite (server/people.ts) e
// recuperação de senha (recuperar-senha/page.tsx). Um valor fora desta lista
// é tratado como link inválido, em vez de repassado sem checagem ao SDK.
const TIPOS_PERMITIDOS = new Set<string>(['invite', 'recovery'])

function comoTipoValido(valor: string | null): valor is EmailOtpType {
  return valor !== null && TIPOS_PERMITIDOS.has(valor)
}

/**
 * Só aceita um caminho interno começando com uma única barra. Sem esta
 * checagem, `next` — que vem direto da query string, controlada por quem
 * monta o link — poderia apontar para fora do domínio (`https://evil.com`)
 * ou usar um caminho "protocol-relative" (`//evil.com`, que o navegador trata
 * como um domínio externo apesar de parecer um caminho interno). Como esta
 * rota já autenticou a pessoa antes do redirect, um `next` externo abriria
 * open redirect a partir do próprio domínio da empresa, incluindo o caso mais
 * grave: um link de recuperação com o token do PRÓPRIO atacante, que loga a
 * vítima na conta dele e a leva embora do site em seguida.
 */
function proximaRotaSegura(valor: string | null): string {
  if (valor && valor.startsWith('/') && !valor.startsWith('//')) return valor
  return '/convite'
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const next = proximaRotaSegura(searchParams.get('next'))

  if (!token_hash || !comoTipoValido(type)) redirect('/login?erro=link-invalido')

  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.verifyOtp({ type, token_hash })

  if (error) redirect('/login?erro=link-expirado')
  redirect(next)
}
