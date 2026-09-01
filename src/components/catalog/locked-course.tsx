import type { CourseView } from '@/server/viewer'
import { RequestAccessForm } from './request-access-form'

export function LockedCourse({
  course,
  requestStatus,
}: {
  course: CourseView
  requestStatus: 'none' | 'pending'
}) {
  return (
    <div className="mx-auto max-w-lg rounded-card border border-borda bg-superficie p-8 text-center">
      <div
        className="aspect-video w-full overflow-hidden rounded-card border border-borda bg-fundo"
        style={course.coverUrl ? undefined : { backgroundColor: course.areaColor ?? '#e3e6ea' }}
      >
        {course.coverUrl && (
          // Capa é URL externa informada pelo líder; next/image exigiria allowlist de domínio.
          // Mesmo mecanismo de course-card.tsx: a capa de um curso bloqueado já é
          // exibida na vitrine, então não é uma fronteira de confiança nova aqui.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={course.coverUrl} alt="" className="h-full w-full object-cover" />
        )}
      </div>

      <span aria-hidden className="mt-4 block text-3xl">
        🔒
      </span>
      <h1 className="mt-3 text-lg font-semibold">{course.title}</h1>
      <p className="mt-1 text-xs text-texto-suave">{course.areaName ?? 'Trilha inicial'}</p>
      {course.description && <p className="mt-4 text-sm text-texto-suave">{course.description}</p>}
      <p className="mt-6 text-sm text-texto-suave">Você ainda não tem acesso a este curso.</p>
      <RequestAccessForm courseSlug={course.slug} jaSolicitado={requestStatus === 'pending'} />
    </div>
  )
}
