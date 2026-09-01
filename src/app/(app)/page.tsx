import { AreaCard } from '@/components/catalog/area-card'
import { HeroBanner } from '@/components/catalog/hero-banner'
import { getCurrentUser } from '@/lib/auth/session'
import { getCatalog } from '@/server/catalog'
import { getContinueWatching } from '@/server/progress'
import { escolherDestaque, montarVitrine } from '@/server/vitrine-query'

export const metadata = { title: 'Início — GEX Academy' }

export default async function HomePage() {
  const [user, catalog, continuar] = await Promise.all([
    getCurrentUser(),
    getCatalog(),
    getContinueWatching(),
  ])

  const areas = montarVitrine(catalog)
  // A decisão de "trilha pendente vs. não" mora em escolherDestaque
  // (vitrine-query.ts), testada lá caso a caso — inclusive as bordas sem
  // trilha no sistema e sem acesso a ela. Aqui só se combina o resultado com
  // `continuar`: sem os dois, não se inventa destaque — banner falso é pior
  // que ausência de banner, e fica o cabeçalho de saudação simples.
  const destaque = escolherDestaque(catalog.onboarding, continuar !== null)

  return (
    <div className="flex flex-col gap-10">
      {destaque.tipo === 'trilha' ? (
        <HeroBanner
          rotulo="Comece por aqui"
          titulo={destaque.item.title}
          subtitulo={
            destaque.item.description ??
            `${destaque.item.lessonCount} ${destaque.item.lessonCount === 1 ? 'aula' : 'aulas'} sobre a empresa`
          }
          coverUrl={destaque.item.coverUrl}
          href={`/curso/${destaque.item.slug}`}
          textoBotao={destaque.item.progress.completed > 0 ? 'Continuar' : 'Começar'}
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
