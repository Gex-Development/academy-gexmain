import Link from 'next/link'
import { CourseCard } from '@/components/catalog/course-card'
import { getCurrentUser } from '@/lib/auth/session'
import { getCatalog } from '@/server/catalog'
import { getContinueWatching } from '@/server/progress'

export const metadata = { title: 'Início — GEX Academy' }

export default async function HomePage() {
  const [user, catalog, continuar] = await Promise.all([
    getCurrentUser(),
    getCatalog(),
    getContinueWatching(),
  ])

  return (
    <div className="flex flex-col gap-10">
      <header>
        <h1 className="text-xl font-semibold">Olá, {user!.fullName.split(' ')[0]}</h1>
      </header>

      {continuar && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-texto-suave">
            Continue de onde parou
          </h2>
          <Link
            href={`/curso/${continuar.courseSlug}/aula/${continuar.lessonSlug}`}
            className="block rounded-card border border-borda bg-superficie p-4 hover:bg-fundo"
          >
            <p className="text-sm font-medium">{continuar.lessonTitle}</p>
            <p className="text-xs text-texto-suave">{continuar.courseTitle}</p>
          </Link>
        </section>
      )}

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
        <section key={grupo.groupKey}>
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
