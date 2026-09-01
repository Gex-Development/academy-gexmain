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
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <Link href="/" className="text-marca-600" aria-label="Início">
            <GexLogo className="h-6 w-auto" />
          </Link>
          <nav aria-label="Principal" className="flex flex-1 gap-4">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-texto-suave hover:text-texto"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <span className="text-sm text-texto-suave">{user.fullName}</span>
          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  )
}
