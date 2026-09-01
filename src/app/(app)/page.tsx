import { AreaCard } from '@/components/catalog/area-card'
import { HeroBanner } from '@/components/catalog/hero-banner'
import { getCurrentUser } from '@/lib/auth/session'
import { getCatalog } from '@/server/catalog'
import { getContinueWatching } from '@/server/progress'
import { montarVitrine } from '@/server/vitrine-query'

export const metadata = { title: 'Início — GEX Academy' }

export default async function HomePage() {
  const [user, catalog, continuar] = await Promise.all([
    getCurrentUser(),
    getCatalog(),
    getContinueWatching(),
  ])

  const areas = montarVitrine(catalog)
  const onboarding = catalog.onboarding
  const trilhaPendente =
    onboarding !== null && onboarding.access !== 'none' && onboarding.progress.percent < 100

  // Prioridade do banner: quem ainda não terminou a trilha inicial precisa
  // dela em primeiro lugar — é a primeira coisa que a pessoa tem a fazer na
  // empresa. Só depois entra "continue de onde parou". Sem nenhum dos dois,
  // não se inventa destaque: banner falso é pior que ausência de banner.
  return (
    <div className="flex flex-col gap-10">
      {trilhaPendente ? (
        <HeroBanner
          rotulo="Comece por aqui"
          titulo={onboarding!.title}
          subtitulo={
            onboarding!.description ??
            `${onboarding!.lessonCount} ${onboarding!.lessonCount === 1 ? 'aula' : 'aulas'} sobre a empresa`
          }
          coverUrl={onboarding!.coverUrl}
          href={`/curso/${onboarding!.slug}`}
          textoBotao={onboarding!.progress.completed > 0 ? 'Continuar' : 'Começar'}
        />
      ) : continuar ? (
        <HeroBanner
          rotulo="Continue de onde parou"
          titulo={continuar.lessonTitle}
          subtitulo={continuar.courseTitle}
          coverUrl={null}
          href={`/curso/${continuar.courseSlug}/aula/${continuar.lessonSlug}`}
          textoBotao="Continuar"
        />
      ) : (
        <header>
          <h1 className="text-xl font-semibold">Olá, {user!.fullName.split(' ')[0]}</h1>
        </header>
      )}

      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-texto-suave">
          Explore por área
        </h2>
        {areas.length === 0 ? (
          <p className="text-sm text-texto-suave">
            Nenhum curso publicado ainda. Assim que os líderes publicarem, as áreas aparecem aqui.
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {areas.map((area) => (
              <AreaCard key={area.key} area={area} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
