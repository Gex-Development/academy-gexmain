'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { toggleLessonComplete } from '@/server/progress'

export function CompleteButton({
  lessonId,
  courseSlug,
  completed,
  destaque = false,
}: {
  lessonId: string
  courseSlug: string
  completed: boolean
  /**
   * Se este botão é a ação principal da tela (visual sólido) — verdadeiro só
   * quando não existe outro botão primário ao lado (a sala de aula passa
   * `!proxima`: sem "Próxima ›" na última aula, concluir vira a ação
   * principal). Em qualquer outro lugar, ou já concluída, o botão fica
   * secundário — nunca dois pills sólidos com o mesmo peso lado a lado.
   */
  destaque?: boolean
}) {
  const [state, action, pending] = useActionState(toggleLessonComplete, null)
  const concluida = state?.ok ? state.data.completed : completed

  return (
    <form action={action}>
      <input type="hidden" name="lessonId" value={lessonId} />
      <input type="hidden" name="courseSlug" value={courseSlug} />
      <Button type="submit" variant={destaque && !concluida ? 'primario' : 'secundario'} disabled={pending}>
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
