import Link from 'next/link'
import { LoginForm } from './login-form'

export const metadata = { title: 'Entrar — GEX Academy' }

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
      <LoginForm redirectTo={redirect ?? '/'} />
      <p className="mt-4 text-center text-xs text-texto-suave">
        <Link href="/recuperar-senha" className="underline">
          Esqueci minha senha
        </Link>
      </p>
    </>
  )
}
