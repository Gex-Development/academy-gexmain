import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { AppShell } from '@/components/layout/app-shell'
import { getCurrentUser } from '@/lib/auth/session'

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  if (user.status === 'invited') redirect('/convite')
  if (user.status === 'inactive') {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <p className="max-w-sm text-center text-sm text-texto-suave">
          Seu acesso à GEX Academy está desativado. Fale com o administrador.
        </p>
      </div>
    )
  }

  return <AppShell user={user}>{children}</AppShell>
}
