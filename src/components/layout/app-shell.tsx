import Link from 'next/link'
import type { ReactNode } from 'react'
import type { CurrentUser } from '@/lib/auth/session'
import { GexLogo } from './gex-logo'
import { navLinksForRole } from './nav-links'
import { SignOutButton } from './sign-out-button'
import { ThemeToggle } from './theme-toggle'

export function AppShell({ user, children }: { user: CurrentUser; children: ReactNode }) {
  const links = navLinksForRole(user.role)

  return (
    <div className="min-h-screen">
      <header className="border-b border-borda bg-superficie">
        {/*
          Três colunas com os lados de mesmo peso (1fr / auto / 1fr): é o que
          deixa o menu CENTRADO na barra, e não apenas "depois da logo". Com
          flex e flex-1 no nav, o menu ficava colado à esquerda e a posição
          dele mudava conforme o tamanho do nome de quem entrou.
        */}
        <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 py-3">
          <Link href="/" className="justify-self-start text-marca-600" aria-label="Início">
            <GexLogo className="h-9 w-auto" />
          </Link>

          {/* flex-wrap porque são até oito itens: em tela estreita eles
              quebram para a linha de baixo em vez de vazar para fora. */}
          <nav aria-label="Principal" className="flex flex-wrap justify-center gap-4">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-texto-suave transition-colors hover:text-texto"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center justify-end gap-3">
            <span className="hidden text-sm text-texto-suave sm:inline">{user.fullName}</span>
            <ThemeToggle />
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  )
}
