'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { decideAccessRequest, type PendingRequest } from '@/server/access-requests'

const formatador = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
})

export function RequestRow({ request }: { request: PendingRequest }) {
  const [state, action, pending] = useActionState(decideAccessRequest, null)

  return (
    <li className="flex flex-col gap-3 rounded-card border border-borda bg-superficie p-4 md:flex-row md:items-center">
      <div className="flex-1">
        <p className="text-sm font-medium">
          {request.personName} → {request.courseTitle}
        </p>
        <p className="text-xs text-texto-suave">
          {request.personEmail}
          {request.areaName ? ` · ${request.areaName}` : ''} ·{' '}
          {formatador.format(new Date(request.createdAt))}
        </p>
        {request.message && (
          <p className="mt-2 whitespace-pre-line text-sm text-texto-suave">“{request.message}”</p>
        )}
        {state && !state.ok && (
          <p role="alert" className="mt-1 text-xs text-perigo">
            {state.error}
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <form action={action}>
          <input type="hidden" name="id" value={request.id} />
          <input type="hidden" name="decisao" value="approved" />
          <Button type="submit" disabled={pending} className="px-3 py-1 text-xs">
            Aprovar
          </Button>
        </form>
        <form action={action}>
          <input type="hidden" name="id" value={request.id} />
          <input type="hidden" name="decisao" value="denied" />
          <Button type="submit" variant="secundario" disabled={pending} className="px-3 py-1 text-xs">
            Negar
          </Button>
        </form>
      </div>
    </li>
  )
}
