import { notFound } from 'next/navigation'
import { LockedCourse } from '@/components/catalog/locked-course'
import { BannerCurso } from '@/components/curso/banner-curso'
import { ListaDeEpisodios } from '@/components/curso/lista-de-episodios'
import { VoltarCircular } from '@/components/layout/voltar-circular'
import { formatDuration } from '@/lib/format'
import { acaoDoCurso, estadoDasAulas } from '@/lib/progress/proxima-aula'
import { getPendingRequestStatus } from '@/server/access-requests'
import { getCompletedLessonIds } from '@/server/progress'
import { capaComReserva } from '@/server/vitrine-query'
import { getCourseView } from '@/server/viewer'

export default async function CursoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const course = await getCourseView(slug)
  if (!course) notFound()

  if (course.access === 'none') {
    const requestStatus = await getPendingRequestStatus(course.id)
    return <LockedCourse course={course} requestStatus={requestStatus} />
  }

  const concluidas = await getCompletedLessonIds(course.id)
  const acao = acaoDoCurso(course.lessons, concluidas)
  const estados = estadoDasAulas(course.lessons, concluidas)
  const concluidasNoCurso = course.lessons.filter((l) => concluidas.has(l.id)).length
  const capa = capaComReserva({ coverUrl: course.coverUrl, areaCoverUrl: course.areaCoverUrl })
  const totalSegundos = course.lessons.reduce((soma, l) => soma + (l.durationSeconds ?? 0), 0)

  const botao =
    acao.tipo === 'nenhuma'
      ? null
      : {
          href: `/curso/${course.slug}/aula/${course.lessons[acao.indice]!.slug}`,
          texto:
            acao.tipo === 'comecar' ? 'Começar' : acao.tipo === 'continuar' ? `Continuar aula ${acao.indice + 1}` : 'Rever curso',
        }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <VoltarCircular href={course.areaSlug ? `/area/${course.areaSlug}` : '/'} rotulo={course.areaName ?? 'Início'} />

      <BannerCurso
        rotulo={`${course.areaName ?? 'Trilha inicial'} · ${course.lessons.length} ${course.lessons.length === 1 ? 'aula' : 'aulas'}`}
        titulo={course.title}
        descricao={course.description}
        capaUrl={capa}
        concluidas={concluidasNoCurso}
        total={course.lessons.length}
        acao={botao}
      />

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-texto">Aulas</h2>
          {totalSegundos > 0 && <span className="text-sm text-texto-suave">{formatDuration(totalSegundos)}</span>}
        </div>
        <div className="overflow-hidden rounded-2xl border border-vidro-borda bg-vidro backdrop-blur-md">
          <ListaDeEpisodios courseSlug={course.slug} aulas={course.lessons} estados={estados} capaUrl={capa} />
        </div>
      </section>
    </div>
  )
}
