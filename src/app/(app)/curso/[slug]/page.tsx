import Link from 'next/link'
import { notFound } from 'next/navigation'
import { LockedCourse } from '@/components/catalog/locked-course'
import { ProgressBar } from '@/components/progress/progress-bar'
import { formatDuration } from '@/lib/format'
import { getCompletedLessonIds } from '@/server/progress'
import { getCourseView } from '@/server/viewer'

export default async function CursoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const course = await getCourseView(slug)
  if (!course) notFound()

  if (course.access === 'none') return <LockedCourse course={course} />

  const concluidas = await getCompletedLessonIds(course.id)

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-semibold">{course.title}</h1>
      <p className="mt-1 text-xs text-texto-suave">
        {course.areaName ?? 'Trilha inicial'} · {course.lessons.length}{' '}
        {course.lessons.length === 1 ? 'aula' : 'aulas'}
      </p>
      {course.description && <p className="mt-4 text-sm text-texto-suave">{course.description}</p>}

      <div className="mt-4">
        <ProgressBar completed={concluidas.size} total={course.lessons.length} />
      </div>

      <ol className="mt-8 divide-y divide-borda rounded-card border border-borda bg-superficie">
        {course.lessons.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-texto-suave">
            Este curso ainda não tem aulas publicadas.
          </li>
        )}
        {course.lessons.map((lesson, indice) => (
          <li key={lesson.id}>
            <Link
              href={`/curso/${course.slug}/aula/${lesson.slug}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-fundo"
            >
              <span className="w-6 text-xs text-texto-suave">{indice + 1}</span>
              <span aria-hidden className="w-4 text-sucesso">
                {concluidas.has(lesson.id) ? '✓' : ''}
              </span>
              <span className="flex-1 text-sm">{lesson.title}</span>
              <span className="text-xs text-texto-suave">{formatDuration(lesson.durationSeconds)}</span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  )
}
