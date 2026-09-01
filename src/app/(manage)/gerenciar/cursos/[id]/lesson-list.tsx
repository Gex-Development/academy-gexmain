'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { formatDuration } from '@/lib/format'
import { createLesson, deleteLesson, moveLesson, type LessonRow } from '@/server/lessons'

export function LessonList({ courseId, lessons }: { courseId: string; lessons: LessonRow[] }) {
  const [createState, createAction, creating] = useActionState(createLesson, null)
  const [moveState, moveAction, moving] = useActionState(moveLesson, null)
  const [deleteState, deleteAction, deleting] = useActionState(deleteLesson, null)
  const erro =
    (!createState?.ok && createState?.error) ||
    (!moveState?.ok && moveState?.error) ||
    (!deleteState?.ok && deleteState?.error)

  return (
    <div className="flex flex-col gap-6">
      <ul className="divide-y divide-borda rounded-card border border-borda bg-superficie">
        {lessons.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-texto-suave">
            Nenhuma aula ainda. Crie a primeira abaixo.
          </li>
        )}
        {lessons.map((lesson, indice) => (
          <li key={lesson.id} className="flex items-center gap-3 px-4 py-3">
            <span className="w-6 text-xs text-texto-suave">{indice + 1}</span>
            <div className="flex-1">
              <Link
                href={`/gerenciar/cursos/${courseId}/aulas/${lesson.id}`}
                className="text-sm font-medium hover:underline"
              >
                {lesson.title}
              </Link>
              <p className="text-xs text-texto-suave">
                {lesson.provider === 'youtube' ? 'YouTube' : 'VTurb'} ·{' '}
                {formatDuration(lesson.durationSeconds)} ·{' '}
                {lesson.status === 'published' ? 'Publicada' : 'Rascunho'}
              </p>
            </div>

            <form action={moveAction}>
              <input type="hidden" name="id" value={lesson.id} />
              <input type="hidden" name="direcao" value="cima" />
              <Button
                type="submit"
                variant="secundario"
                className="px-2 py-1 text-xs"
                disabled={indice === 0 || moving}
              >
                ↑
              </Button>
            </form>
            <form action={moveAction}>
              <input type="hidden" name="id" value={lesson.id} />
              <input type="hidden" name="direcao" value="baixo" />
              <Button
                type="submit"
                variant="secundario"
                className="px-2 py-1 text-xs"
                disabled={indice === lessons.length - 1 || moving}
              >
                ↓
              </Button>
            </form>
            <form
              action={deleteAction}
              onSubmit={(e) => {
                if (
                  !confirm(
                    `Excluir a aula "${lesson.title}"? Isso apaga os anexos, as dúvidas e o registro de conclusão de quem já assistiu.`,
                  )
                ) {
                  e.preventDefault()
                }
              }}
            >
              <input type="hidden" name="id" value={lesson.id} />
              <Button type="submit" variant="perigo" className="px-2 py-1 text-xs" disabled={deleting}>
                {deleting ? 'Excluindo…' : 'Excluir'}
              </Button>
            </form>
          </li>
        ))}
      </ul>

      {erro && (
        <p role="alert" className="text-xs text-perigo">
          {erro}
        </p>
      )}

      <form action={createAction} className="flex flex-col gap-4 rounded-card border border-borda bg-superficie p-4">
        <h2 className="text-sm font-semibold">Nova aula</h2>
        <input type="hidden" name="courseId" value={courseId} />
        <Field label="Título" htmlFor="novo-title">
          <Input id="novo-title" name="title" required minLength={3} maxLength={120} />
        </Field>
        <Field label="Vídeo" htmlFor="novo-video" hint="Link do YouTube ou código do VTurb">
          <Input id="novo-video" name="video" required />
        </Field>
        <Button type="submit" disabled={creating}>
          {creating ? 'Criando…' : 'Criar aula'}
        </Button>
      </form>
    </div>
  )
}
