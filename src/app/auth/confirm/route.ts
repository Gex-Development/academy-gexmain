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
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/nova-senha
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

// Os dois únicos destinos que existem depois da confirmação — e os dois são
// nossos.
const DESTINOS_PERMITIDOS = ['/convite', '/nova-senha'] as const

/**
 * Só dois destinos existem depois da confirmação, e ambos são nossos. Uma
 * lista branca elimina a classe inteira de redirecionamento aberto — tentar
 * sanear a string perde para a normalização de URL do navegador: um valor
 * como "/\evil.com" não começa com "//", mas o parser de URL (WHATWG, o
 * mesmo algoritmo usado para resolver o cabeçalho Location em qualquer
 * navegador) trata a barra invertida logo após a primeira barra como uma
 * segunda barra e resolve para o host externo "evil.com" — o mesmo vale para
 * "/\/evil.com" e para uma barra seguida de tab ("/\t/evil.com"), já que
 * caracteres de controle como tab são descartados durante a normalização.
 * Nenhum filtro de caracteres fecha essa classe inteira; só a lista branca.
 *
 * O fallback depende de `type`: um link de recuperação sem `next` (ou com um
 * `next` fora da lista) tem que cair em /nova-senha, não em /convite — mandar
 * quem está recuperando a senha para a tela de "bem-vindo, defina sua senha"
 * do convite seria a tela errada.
 */
export function destinoSeguro(bruto: string | null, type: EmailOtpType): string {
  if (bruto && (DESTINOS_PERMITIDOS as readonly string[]).includes(bruto)) return bruto
  return type === 'recovery' ? '/nova-senha' : '/convite'
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')

  if (!token_hash || !comoTipoValido(type)) redirect('/login?erro=link-invalido')

  const next = destinoSeguro(searchParams.get('next'), type)

  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.verifyOtp({ type, token_hash })

  if (error) redirect('/login?erro=link-expirado')
  redirect(next)
}
