import { getCurrentUser } from '@/lib/auth/session'
import { ProfileForm } from './profile-form'

export const metadata = { title: 'Perfil — GEX Academy' }

const ROTULO_PAPEL = { admin: 'Administrador', leader: 'Líder de setor', member: 'Colaborador' } as const

export default async function PerfilPage() {
  const user = await getCurrentUser()

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-xl font-semibold">Perfil</h1>
      <p className="mb-6 mt-1 text-sm text-texto-suave">
        {user!.email} · {ROTULO_PAPEL[user!.role]}
      </p>
      <ProfileForm fullName={user!.fullName} avatarUrl={user!.avatarUrl} />
    </div>
  )
}
