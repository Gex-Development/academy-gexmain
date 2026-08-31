'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import type { AreaRow } from '@/server/areas'
import { setPersonStatus, updatePerson, type PersonRow } from '@/server/people'

const ROTULO_PAPEL = { admin: 'Administrador', leader: 'Líder', member: 'Colaborador' } as const

export function PersonRowItem({
  person,
  areas,
  statusLabel,
}: {
  person: PersonRow
  areas: AreaRow[]
  statusLabel: string
}) {
  const [updateState, updateAction, updating] = useActionState(updatePerson, null)
  const [statusState, statusAction, changingStatus] = useActionState(setPersonStatus, null)
  const erro = (!updateState?.ok && updateState?.error) || (!statusState?.ok && statusState?.error)

  return (
    <li className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center">
      <div className="flex-1">
        <p className="text-sm font-medium">{person.fullName}</p>
        <p className="text-xs text-texto-suave">
          {person.email} · {ROTULO_PAPEL[person.role]}
          {person.areaName ? ` · ${person.areaName}` : ''} · {statusLabel}
        </p>
        {erro && (
          <p role="alert" className="mt-1 text-xs text-perigo">
            {erro}
          </p>
        )}
      </div>

      <form action={updateAction} className="flex items-center gap-2">
        <input type="hidden" name="id" value={person.id} />
        <select
          name="role"
          defaultValue={person.role}
          className="rounded-lg border border-borda bg-superficie px-2 py-1 text-xs"
          aria-label={`Papel de ${person.fullName}`}
        >
          <option value="member">Colaborador</option>
          <option value="leader">Líder</option>
          <option value="admin">Administrador</option>
        </select>
        <select
          name="areaId"
          defaultValue={person.areaId ?? ''}
          className="rounded-lg border border-borda bg-superficie px-2 py-1 text-xs"
          aria-label={`Área de ${person.fullName}`}
        >
          <option value="">Sem área</option>
          {areas.map((area) => (
            <option key={area.id} value={area.id}>
              {area.name}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secundario" disabled={updating} className="px-3 py-1 text-xs">
          Salvar
        </Button>
      </form>

      <form action={statusAction}>
        <input type="hidden" name="id" value={person.id} />
        <input type="hidden" name="status" value={person.status === 'inactive' ? 'active' : 'inactive'} />
        <Button
          type="submit"
          variant={person.status === 'inactive' ? 'secundario' : 'perigo'}
          disabled={changingStatus}
          className="px-3 py-1 text-xs"
        >
          {person.status === 'inactive' ? 'Reativar' : 'Desativar'}
        </Button>
      </form>
    </li>
  )
}
