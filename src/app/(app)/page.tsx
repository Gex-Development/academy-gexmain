import { getCurrentUser } from '@/lib/auth/session'

export const metadata = { title: 'Início — GEX Academy' }

export default async function HomePage() {
  const user = await getCurrentUser()

  return (
    <div>
      <h1 className="text-xl font-semibold">Olá, {user!.fullName.split(' ')[0]}</h1>
      <p className="mt-2 text-sm text-texto-suave">
        A vitrine de cursos aparece aqui na fase 2.
      </p>
    </div>
  )
}
