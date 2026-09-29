import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AbasDaAula } from '@/components/aula/abas-da-aula'
import { ListaDeEpisodios } from '@/components/curso/lista-de-episodios'
import { ForumSection } from '@/components/forum/forum-section'
import { Voltar } from '@/components/layout/voltar'
import { CompleteButton } from '@/components/progress/complete-button'
import { ProgressBar } from '@/components/progress/progress-bar'
import { VideoPlayer } from '@/components/video/video-player'
import { lerAba } from '@/lib/aula/abas'
import { formatDuration } from '@/lib/format'
import { estadoDasAulas } from '@/lib/progress/proxima-aula'
import { listAttachments } from '@/server/attachments'
import { listQuestions } from '@/server/forum'
import { getCompletedLessonIds } from '@/server/progress'
import { getLessonView } from '@/server/viewer'
import { capaComReserva } from '@/server/vitrine-query'

function formatarTamanho(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default async function AulaPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; lessonSlug: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { slug, lessonSlug } = await params
  const abaInicial = lerAba((await searchParams).aba)
  const view = await getLessonView(slug, lessonSlug)
  if (!view) notFound()

  const { course, lesson, proxima, indice } = view
  const [attachments, concluidas, questions] = await Promise.all([
    listAttachments(lesson.id),
    getCompletedLessonIds(course.id),
    listQuestions(lesson.id),
  ])
  const estados = estadoDasAulas(course.lessons, concluidas)
  const concluidasNoCurso = course.lessons.filter((l) => concluidas.has(l.id)).length
  const duracao = lesson.durationSeconds

  const sobre = lesson.description ? (
    // Texto puro: whitespace-pre-line preserva as quebras sem interpretar marcação.
    <p className="whitespace-pre-line text-sm leading-relaxed text-texto-suave">{lesson.description}</p>
  ) : (
    <p className="text-sm text-texto-suave">Esta aula não tem descrição.</p>
  )

  const materiais =
    attachments.length === 0 ? (
      <p className="text-sm text-texto-suave">Esta aula não tem material de apoio.</p>
    ) : (
      <ul className="divide-y divide-vidro-borda overflow-hidden rounded-2xl border border-vidro-borda bg-vidro">
        {attachments.map((anexo) => (
          <li key={anexo.id} className="flex items-center gap-3 px-4 py-3">
            <a href={`/api/anexos/${anexo.id}`} className="flex-1 truncate text-sm text-marca-600 hover:underline">
              {anexo.fileName}
            </a>
            <span className="text-xs text-texto-suave">{formatarTamanho(anexo.sizeBytes)}</span>
          </li>
        ))}
      </ul>
    )

  return (
    <div className="flex flex-col gap-4">
      <Voltar href={`/curso/${course.slug}`}>{course.title}</Voltar>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <div className="overflow-hidden rounded-2xl border border-vidro-borda">
            <VideoPlayer provider={lesson.provider} videoRef={lesson.ref} title={lesson.title} />
          </div>

          <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-texto text-balance">{lesson.title}</h1>
              <p className="mt-1 text-sm text-texto-suave">
                Aula {indice + 1} de {course.lessons.length}
                {duracao ? ` · ${formatDuration(duracao)}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <CompleteButton
                lessonId={lesson.id}
                courseSlug={course.slug}
                completed={concluidas.has(lesson.id)}
                // Sem "Próxima ›" (última aula do curso), concluir é a única
                // ação possível aqui — vira o botão sólido. Com "Próxima ›"
                // ao lado, ela é a principal, e concluir fica secundário.
                destaque={!proxima}
              />
              {proxima && (
                <Link
                  href={`/curso/${course.slug}/aula/${proxima}`}
                  className="inline-flex items-center rounded-full bg-acao px-4 py-2 text-sm font-semibold text-acao-texto transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-acao"
                >
                  Próxima ›
                </Link>
              )}
            </div>
          </div>

          <div className="mt-6">
            <AbasDaAula
              inicial={abaInicial}
              abas={[
                { id: 'sobre', rotulo: 'Sobre', conteudo: sobre },
                { id: 'materiais', rotulo: `Materiais · ${attachments.length}`, conteudo: materiais },
                {
                  id: 'duvidas',
                  rotulo: `Dúvidas · ${questions.length}`,
                  conteudo: <ForumSection lessonId={lesson.id} questions={questions} />,
                },
              ]}
            />
          </div>
        </div>

        <aside className="self-start overflow-hidden rounded-2xl border border-vidro-borda bg-vidro backdrop-blur-md lg:sticky lg:top-24">
          <div className="border-b border-vidro-borda px-4 py-3">
            <p className="text-sm font-semibold text-texto">Aulas do curso</p>
            <div className="mt-2">
              <ProgressBar completed={concluidasNoCurso} total={course.lessons.length} />
            </div>
          </div>
          <ListaDeEpisodios
            courseSlug={course.slug}
            aulas={course.lessons}
            estados={estados}
            capaUrl={capaComReserva({ coverUrl: course.coverUrl, areaCoverUrl: course.areaCoverUrl })}
            aulaAtualId={lesson.id}
            compacta
          />
        </aside>
      </div>
    </div>
  )
}
