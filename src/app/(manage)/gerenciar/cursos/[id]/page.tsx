import { notFound } from 'next/navigation'
import { getManagedCourse } from '@/server/courses'
import { CourseSettings } from './course-settings'

export default async function EditarCursoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const course = await getManagedCourse(id)
  if (!course) notFound()

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_360px]">
      <section>
        <h1 className="text-xl font-semibold">{course.title}</h1>
        <p className="mt-1 text-sm text-texto-suave">
          {course.isOnboarding ? 'Trilha inicial' : (course.areaName ?? 'Sem área')}
        </p>
        <p className="mt-6 text-sm text-texto-suave">
          A lista de aulas aparece aqui na próxima tarefa.
        </p>
      </section>
      <aside>
        <CourseSettings course={course} />
      </aside>
    </div>
  )
}
