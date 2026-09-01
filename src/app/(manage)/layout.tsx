import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { AppShell } from '@/components/layout/app-shell'
import { getCurrentUser } from '@/lib/auth/session'

export default async function ManageLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (user.status !== 'active' || user.role === 'member') redirect('/')

  return <AppShell user={user}>{children}</AppShell>
}
