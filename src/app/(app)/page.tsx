import { CourseCard } from '@/components/catalog/course-card'
import { getCurrentUser } from '@/lib/auth/session'
import { getCatalog } from '@/server/catalog'

export const metadata = { title: 'Início — GEX Academy' }

export default async function HomePage() {
  const [user, catalog] = await Promise.all([getCurrentUser(), getCatalog()])

  return (
    <div className="flex flex-col gap-10">
      <header>
        <h1 className="text-xl font-semibold">Olá, {user!.fullName.split(' ')[0]}</h1>
      </header>

      {catalog.onboarding && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-texto-suave">
            Comece por aqui
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <CourseCard item={catalog.onboarding} />
          </ul>
        </section>
      )}

      {catalog.grupos.map((grupo) => (
        <section key={grupo.areaName}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-texto-suave">
            {grupo.areaName}
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {grupo.items.map((item) => (
              <CourseCard key={item.id} item={item} />
            ))}
          </ul>
        </section>
      ))}

      {!catalog.onboarding && catalog.grupos.length === 0 && (
        <p className="text-sm text-texto-suave">
          Nenhum curso publicado ainda. Assim que os líderes publicarem, eles aparecem aqui.
        </p>
      )}
    </div>
  )
}
