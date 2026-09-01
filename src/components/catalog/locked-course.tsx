import type { CourseView } from '@/server/viewer'

export function LockedCourse({ course }: { course: CourseView }) {
  return (
    <div className="mx-auto max-w-lg rounded-card border border-borda bg-superficie p-8 text-center">
      <span aria-hidden className="text-3xl">
        🔒
      </span>
      <h1 className="mt-3 text-lg font-semibold">{course.title}</h1>
      <p className="mt-1 text-xs text-texto-suave">{course.areaName ?? 'Trilha inicial'}</p>
      {course.description && <p className="mt-4 text-sm text-texto-suave">{course.description}</p>}
      <p className="mt-6 text-sm text-texto-suave">Você ainda não tem acesso a este curso.</p>
    </div>
  )
}
