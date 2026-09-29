import { DestaqueHome } from '@/components/catalog/destaque-home'
import { FileiraArea } from '@/components/catalog/fileira-area'
import { FileiraEmBreve } from '@/components/catalog/fileira-em-breve'
import { FiltrosProgresso } from '@/components/catalog/filtros-progresso'
import { getCurrentUser } from '@/lib/auth/session'
import { listAreas } from '@/server/areas'
import { getCatalog } from '@/server/catalog'
import { getContinueWatching } from '@/server/progress'
import {
  capaComReserva,
  escolherDestaque,
  itemDoCatalogo,
  lerFiltro,
  linhaDaTrilha,
  montarFileiras,
} from '@/server/vitrine-query'

export const metadata = { title: 'Início — GEX Academy' }

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const filtro = lerFiltro((await searchParams).filtro)

  const [user, catalog, continuar, todasAsAreas] = await Promise.all([
    getCurrentUser(),
    getCatalog(),
    getContinueWatching(),
    // Áreas sem curso publicado não geram grupo no catálogo; listAreas()
    // completa as fileiras com elas ("Em breve"). Mesma consulta do admin,
    // legível por qualquer colaborador ativo (RLS areas_leitura).
    listAreas(),
  ])

  // escolherDestaque continua a autoridade: trilha pendente primeiro, depois
  // retomada. O filtro NÃO age no destaque (spec, seção 5).
  const destaque = escolherDestaque(catalog.onboarding, continuar !== null)
  // Revisão final, Important #1: a trilha some do banner quando concluída
  // (ou sem acesso), mas não pode sumir da home inteira — linhaDaTrilha põe
  // uma fileira de um card só no topo, sujeita ao filtro ativo (some em
  // "Não iniciados", aparece em "Concluídos").
  const trilha = linhaDaTrilha(catalog.onboarding, destaque, filtro)
  const fileiras = montarFileiras(catalog, todasAsAreas, filtro)
  // Rodada de correção 1: com dado real, a maioria das áreas não tem curso
  // publicado — uma FileiraArea cheia por área vazia virava uma parede de
  // caixas "Em breve" em branco. As com curso continuam uma fileira cada;
  // as sem curso são agrupadas numa única FileiraEmBreve, no fim.
  const fileirasComCurso = fileiras.filter((f) => f.items.length > 0)
  const fileirasSemCurso = fileiras.filter((f) => f.items.length === 0)
  const primeiroNome = user!.fullName.split(' ')[0]

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-5">
        <h1 className="text-3xl font-semibold tracking-tight text-texto">Olá, {primeiroNome}</h1>
        <FiltrosProgresso ativo={filtro} />
      </header>

      {destaque.tipo === 'trilha' ? (
        <DestaqueHome
          rotulo="Comece por aqui"
          titulo={destaque.item.title}
          detalhe={`Trilha inicial · ${destaque.item.lessonCount} ${destaque.item.lessonCount === 1 ? 'aula' : 'aulas'}`}
          capaUrl={capaComReserva(destaque.item)}
          concluidas={destaque.item.progress.completed}
          total={destaque.item.progress.total}
          href={`/curso/${destaque.item.slug}`}
          textoBotao={destaque.item.progress.completed > 0 ? 'Continuar' : 'Começar'}
        />
      ) : destaque.tipo === 'retomada' && continuar ? (
        (() => {
          const item = itemDoCatalogo(catalog, continuar.courseSlug)
          return (
            <DestaqueHome
              rotulo="Continue de onde parou"
              titulo={continuar.courseTitle}
              detalhe={`Aula ${continuar.lessonNumber} de ${continuar.lessonCount} · ${continuar.lessonTitle}`}
              capaUrl={item ? capaComReserva(item) : null}
              concluidas={continuar.completedCount}
              total={continuar.lessonCount}
              href={`/curso/${continuar.courseSlug}/aula/${continuar.lessonSlug}`}
              textoBotao="Continuar"
            />
          )
        })()
      ) : null}

      {fileiras.length === 0 && !trilha ? (
        <p className="text-sm text-texto-suave">
          {filtro === 'tudo'
            ? 'Nenhuma área cadastrada ainda. Assim que o administrador criar as áreas, elas aparecem aqui.'
            : 'Nenhum curso neste filtro.'}
        </p>
      ) : (
        <>
          {trilha && <FileiraArea fileira={trilha} />}
          {fileirasComCurso.map((fileira) => (
            <FileiraArea key={fileira.key} fileira={fileira} />
          ))}
          {fileirasSemCurso.length > 0 && <FileiraEmBreve fileiras={fileirasSemCurso} />}
        </>
      )}
    </div>
  )
}
