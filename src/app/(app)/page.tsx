import { AreaCard } from '@/components/catalog/area-card'
import { HeroBanner } from '@/components/catalog/hero-banner'
import { getCurrentUser } from '@/lib/auth/session'
import { getCatalog } from '@/server/catalog'
import { getContinueWatching } from '@/server/progress'
import { capaDoCurso, escolherDestaque, montarVitrine } from '@/server/vitrine-query'

export const metadata = { title: 'Início — GEX Academy' }

export default async function HomePage() {
  const [user, catalog, continuar] = await Promise.all([
    getCurrentUser(),
    getCatalog(),
    getContinueWatching(),
  ])

  const areas = montarVitrine(catalog)
  // escolherDestaque (vitrine-query.ts) é a autoridade nos três ramos —
  // testada caso a caso, inclusive as bordas sem trilha no sistema e sem
  // acesso a ela. O JSX abaixo pergunta a ELA (destaque.tipo), nunca decide
  // de novo a partir de `continuar`: o `&& continuar` no ramo 'retomada' é
  // só o estreitamento de tipo que o TypeScript exige, não uma segunda
  // opinião — se uma regra nova entrar em escolherDestaque amanhã, é aqui
  // que o efeito aparece. Sem trilha nem retomada, não se inventa destaque:
  // banner falso é pior que ausência de banner, e fica o cabeçalho de
  // saudação simples.
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
          // DESVIO DE SPEC, registrado (tabela §3 de
          // docs/superpowers/specs/2026-09-01-gex-academy-vitrine-design.md):
          // a §5.1.1 pede que o botão aponte para a PRÓXIMA AULA NÃO
          // CONCLUÍDA, não para o índice do curso. Resolver isso direito
          // exige uma consulta nova nesta página (lista de aulas do curso +
          // progresso, algo como getCourseView(destaque.item.slug) — o
          // catalog não carrega aula nenhuma, de propósito, ver o comentário
          // em catalog.ts) — por isso ficou só registrado, não implementado,
          // até essa consulta ser aprovada.
          href={`/curso/${destaque.item.slug}`}
          textoBotao={destaque.item.progress.completed > 0 ? 'Continuar' : 'Começar'}
        />
      ) : destaque.tipo === 'retomada' && continuar ? (
        <HeroBanner
          rotulo="Continue de onde parou"
          titulo={continuar.lessonTitle}
          subtitulo={continuar.courseTitle}
          // A §5.1.2 da spec pede a capa do CURSO aqui. getContinueWatching
          // não devolve capa (não é dela); o catalog já está inteiro em
          // memória nesta mesma requisição, então capaDoCurso só procura o
          // slug nele — zero consulta nova (ver o comentário em
          // vitrine-query.ts). Como o banco real não tem trilha inicial
          // hoje, este é o banner que a maioria das pessoas vai ver.
          coverUrl={capaDoCurso(catalog, continuar.courseSlug)}
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
