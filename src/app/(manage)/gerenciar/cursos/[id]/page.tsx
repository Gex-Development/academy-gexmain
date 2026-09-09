import { notFound } from 'next/navigation'
import { Voltar } from '@/components/layout/voltar'
import { getManagedCourse } from '@/server/courses'
import { listLessons } from '@/server/lessons'
import { CourseSettings } from './course-settings'
import { LessonList } from './lesson-list'

export default async function EditarCursoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [course, lessons] = await Promise.all([getManagedCourse(id), listLessons(id)])
  if (!course) notFound()

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_360px]">
      <section>
        <Voltar href="/gerenciar">Cursos</Voltar>
        <h1 className="mt-2 text-xl font-semibold">{course.title}</h1>
        <p className="mb-6 mt-1 text-sm text-texto-suave">
          {course.isOnboarding ? 'Trilha inicial' : (course.areaName ?? 'Sem área')}
        </p>
        <LessonList courseId={course.id} lessons={lessons} />
      </section>
      <aside>
        <CourseSettings course={course} />
      </aside>
    </div>
  )
}
