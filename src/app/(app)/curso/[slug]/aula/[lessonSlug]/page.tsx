import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CompleteButton } from '@/components/progress/complete-button'
import { ForumSection } from '@/components/forum/forum-section'
import { VideoPlayer } from '@/components/video/video-player'
import { listAttachments } from '@/server/attachments'
import { listQuestions } from '@/server/forum'
import { getCompletedLessonIds } from '@/server/progress'
import { getLessonView } from '@/server/viewer'

function formatarTamanho(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default async function AulaPage({
  params,
}: {
  params: Promise<{ slug: string; lessonSlug: string }>
}) {
  const { slug, lessonSlug } = await params
  const view = await getLessonView(slug, lessonSlug)
  if (!view) notFound()

  const { course, lesson, anterior, proxima } = view
  const attachments = await listAttachments(lesson.id)
  const concluidas = await getCompletedLessonIds(course.id)
  const questions = await listQuestions(lesson.id)

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/curso/${course.slug}`} className="text-xs text-texto-suave hover:underline">
        ← {course.title}
      </Link>

      <h1 className="mb-4 mt-2 text-xl font-semibold">{lesson.title}</h1>

      <VideoPlayer provider={lesson.provider} videoRef={lesson.ref} title={lesson.title} />

      <div className="mt-4">
        <CompleteButton lessonId={lesson.id} courseSlug={course.slug} completed={concluidas.has(lesson.id)} />
      </div>

      {lesson.description && (
        // Texto puro: `whitespace-pre-line` preserva as quebras sem interpretar marcação.
        <p className="mt-6 whitespace-pre-line text-sm text-texto-suave">{lesson.description}</p>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold">Materiais</h2>
        {attachments.length === 0 ? (
          <p className="text-xs text-texto-suave">Esta aula não tem material de apoio.</p>
        ) : (
          <ul className="divide-y divide-borda rounded-card border border-borda bg-superficie">
            {attachments.map((anexo) => (
              <li key={anexo.id} className="flex items-center gap-3 px-4 py-2">
                <a
                  href={`/api/anexos/${anexo.id}`}
                  className="flex-1 truncate text-sm text-marca-600 hover:underline"
                >
                  {anexo.fileName}
                </a>
                <span className="text-xs text-texto-suave">{formatarTamanho(anexo.sizeBytes)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <nav className="mt-8 flex items-center justify-between border-t border-borda pt-4">
        {anterior ? (
          <Link
            href={`/curso/${course.slug}/aula/${anterior}`}
            className="text-sm text-marca-600 hover:underline"
          >
            ← Aula anterior
          </Link>
        ) : (
          <span />
        )}
        {proxima && (
          <Link
            href={`/curso/${course.slug}/aula/${proxima}`}
            className="text-sm text-marca-600 hover:underline"
          >
            Próxima aula →
          </Link>
        )}
      </nav>

      <ForumSection lessonId={lesson.id} questions={questions} />
    </div>
  )
}
