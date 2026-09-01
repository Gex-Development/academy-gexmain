'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { toggleLessonComplete } from '@/server/progress'

export function CompleteButton({
  lessonId,
  courseSlug,
  completed,
}: {
  lessonId: string
  courseSlug: string
  completed: boolean
}) {
  const [state, action, pending] = useActionState(toggleLessonComplete, null)
  const concluida = state?.ok ? state.data.completed : completed

  return (
    <form action={action}>
      <input type="hidden" name="lessonId" value={lessonId} />
      <input type="hidden" name="courseSlug" value={courseSlug} />
      <Button type="submit" variant={concluida ? 'secundario' : 'primario'} disabled={pending}>
        {concluida ? '✓ Aula concluída' : 'Marcar como concluída'}
      </Button>
      {state && !state.ok && (
        <p role="alert" className="mt-1 text-xs text-perigo">
          {state.error}
        </p>
      )}
    </form>
  )
}
