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
          {person.extraAreaIds.length > 0 &&
            ` · +${person.extraAreaIds.length} ${
              person.extraAreaIds.length === 1 ? 'área extra' : 'áreas extras'
            }`}
        </p>
        {erro && (
          <p role="alert" className="mt-1 text-xs text-perigo">
            {erro}
          </p>
        )}
      </div>

      <form action={updateAction} className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
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
            aria-label={`Área principal de ${person.fullName}`}
          >
            <option value="">Sem área</option>
            {areas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </select>
          <Button
            type="submit"
            variant="secundario"
            disabled={updating}
            className="px-3 py-1 text-xs"
          >
            Salvar
          </Button>
        </div>

        {/*
          Áreas extras: só LEITURA, e por isso ficam separadas do seletor de
          área principal, que também decide de qual área alguém é líder.
          Caixas em vez de um segundo seletor porque a resposta é um conjunto,
          não uma escolha — e um <select multiple> obriga a segurar Ctrl para
          marcar mais de um, coisa que quase ninguém descobre sozinho.

          A área principal fica de fora da lista: ela já dá acesso pela regra
          6, e oferecê-la aqui sugeriria que marcar muda alguma coisa.
        */}
        <fieldset className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <legend className="sr-only">Áreas extras de {person.fullName}</legend>
          <span className="text-xs text-texto-suave">Também acessa:</span>
          {areas
            .filter((area) => area.id !== person.areaId)
            .map((area) => (
              <label key={area.id} className="flex items-center gap-1 text-xs text-texto-suave">
                <input
                  type="checkbox"
                  name="extraAreaIds"
                  value={area.id}
                  defaultChecked={person.extraAreaIds.includes(area.id)}
                  className="accent-acao"
                />
                {area.name}
              </label>
            ))}
          {areas.filter((area) => area.id !== person.areaId).length === 0 && (
            <span className="text-xs text-texto-suave">nenhuma outra área cadastrada</span>
          )}
        </fieldset>
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
