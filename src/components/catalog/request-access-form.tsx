'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { requestAccess } from '@/server/access-requests'

export function RequestAccessForm({
  courseSlug,
  jaSolicitado,
}: {
  courseSlug: string
  jaSolicitado: boolean
}) {
  const [state, action, pending] = useActionState(requestAccess, null)

  if (jaSolicitado || state?.ok) {
    return (
      <p className="mt-6 text-sm text-sucesso">
        Solicitação enviada. Você recebe um e-mail assim que o administrador decidir.
      </p>
    )
  }

  return (
    <form action={action} className="mt-6 flex flex-col gap-3">
      <input type="hidden" name="courseSlug" value={courseSlug} />
      <label htmlFor="message" className="sr-only">
        Por que você precisa deste curso?
      </label>
      <textarea
        id="message"
        name="message"
        rows={2}
        maxLength={500}
        placeholder="Por que você precisa deste curso? (opcional)"
        className="w-full rounded-lg border border-borda bg-superficie px-3 py-2 text-sm"
      />
      {state && !state.ok && (
        <p role="alert" className="text-xs text-perigo">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? 'Enviando…' : 'Solicitar acesso'}
      </Button>
    </form>
  )
}
