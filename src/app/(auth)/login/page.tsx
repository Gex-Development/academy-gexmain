import Link from 'next/link'
import { LoginForm } from './login-form'

export const metadata = { title: 'Entrar — GEX Academy' }

/**
 * Sanitiza o `redirect` da URL antes de repassá-lo ao client component.
 * /login é pública — qualquer pessoa chega aqui com um `redirect`
 * escolhido por um atacante, sem precisar de sessão — e o LoginForm chama
 * `router.replace(redirectTo)` depois do login. Um destino absoluto ou
 * "protocol-relative" (`https://evil.com`, `//evil.com`) faz essa navegação
 * sair do nosso domínio: phishing logo após autenticar, a partir do próprio
 * domínio da empresa. Barra invertida logo após a barra (`/\evil.com`) e
 * caracteres de controle como tab (`/\t/evil.com`) também resolvem para host
 * externo pelo parser WHATWG — o mesmo algoritmo que o navegador usa para
 * resolver `Location` — por isso a validação usa esse mesmo parser (via
 * `new URL`) em vez de checagem de prefixo feita à mão.
 *
 * Mesma classe de bug já fechada em /auth/confirm
 * (src/app/auth/confirm/route.ts), mas ali só existiam dois destinos
 * possíveis e uma lista branca de valores bastava. Aqui qualquer rota da
 * aplicação é destino legítimo — uma lista branca de valores não é viável —
 * então validamos a forma (mesma origem), não o valor.
 */
export function destinoInterno(bruto: string | undefined): string {
  if (!bruto) return '/'
  try {
    const base = 'https://gex.invalid'
    const url = new URL(bruto, base)
    return url.origin === base ? `${url.pathname}${url.search}${url.hash}` : '/'
  } catch {
    return '/'
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; erro?: string }>
}) {
  const { redirect, erro } = await searchParams

  const MENSAGENS: Record<string, string> = {
    'link-invalido': 'O link do e-mail está incompleto. Peça um novo convite.',
    'link-expirado': 'O link expirou. Peça um novo convite ao administrador.',
  }

  return (
    <>
      {erro && MENSAGENS[erro] && (
        <p role="alert" className="mb-4 rounded-lg bg-perigo/10 p-3 text-xs text-perigo">
          {MENSAGENS[erro]}
        </p>
      )}
      <LoginForm redirectTo={destinoInterno(redirect)} />
      <p className="mt-4 text-center text-xs text-texto-suave">
        <Link href="/recuperar-senha" className="underline">
          Esqueci minha senha
        </Link>
      </p>
    </>
  )
}
