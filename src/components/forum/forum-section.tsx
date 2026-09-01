'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { askQuestion, type ForumQuestion } from '@/server/forum'
import { QuestionItem } from './question-item'

export function ForumSection({
  lessonId,
  questions,
}: {
  lessonId: string
  questions: ForumQuestion[]
}) {
  const [state, action, pending] = useActionState(askQuestion, null)

  return (
    <section className="mt-10">
      <h2 className="mb-3 text-sm font-semibold">Dúvidas</h2>

      <form action={action} className="mb-6 flex flex-col gap-2">
        <input type="hidden" name="lessonId" value={lessonId} />
        <label htmlFor="nova-duvida" className="sr-only">
          Sua dúvida
        </label>
        <textarea
          id="nova-duvida"
          name="body"
          rows={3}
          required
          maxLength={4000}
          placeholder="Ficou com alguma dúvida nesta aula?"
          className="w-full rounded-lg border border-borda bg-superficie px-3 py-2 text-sm"
        />
        {state && !state.ok && (
          <p role="alert" className="text-xs text-perigo">
            {state.error}
          </p>
        )}
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? 'Enviando…' : 'Enviar dúvida'}
        </Button>
      </form>

      {questions.length === 0 ? (
        <p className="text-xs text-texto-suave">
          Nenhuma dúvida ainda. Seja o primeiro a perguntar.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {questions.map((question) => (
            <QuestionItem key={question.id} question={question} />
          ))}
        </ul>
      )}
    </section>
  )
}
