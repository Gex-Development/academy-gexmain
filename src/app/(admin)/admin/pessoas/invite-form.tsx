'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import type { AreaRow } from '@/server/areas'
import { invitePerson } from '@/server/people'

export function InviteForm({ areas }: { areas: AreaRow[] }) {
  const [state, action, pending] = useActionState(invitePerson, null)

  return (
    <form action={action} className="flex flex-col gap-4 rounded-card border border-borda bg-superficie p-4">
      <Field label="Nome completo" htmlFor="fullName">
        <Input id="fullName" name="fullName" required minLength={3} maxLength={120} />
      </Field>
      <Field label="E-mail" htmlFor="email">
        <Input id="email" name="email" type="email" required />
      </Field>
      <Field label="Papel" htmlFor="role">
        <select
          id="role"
          name="role"
          defaultValue="member"
          className="w-full rounded-lg border border-borda bg-superficie px-3 py-2 text-sm"
        >
          <option value="member">Colaborador</option>
          <option value="leader">Líder de setor</option>
          <option value="admin">Administrador</option>
        </select>
      </Field>
      <Field label="Área" htmlFor="areaId" hint="Obrigatória para colaborador e líder">
        <select
          id="areaId"
          name="areaId"
          className="w-full rounded-lg border border-borda bg-superficie px-3 py-2 text-sm"
        >
          <option value="">Sem área</option>
          {areas.map((area) => (
            <option key={area.id} value={area.id}>
              {area.name}
            </option>
          ))}
        </select>
      </Field>

      {state && !state.ok && (
        <p role="alert" className="text-xs text-perigo">
          {state.error}
        </p>
      )}
      {state?.ok && <p className="text-xs text-sucesso">Convite enviado.</p>}

      <Button type="submit" disabled={pending}>
        {pending ? 'Enviando…' : 'Enviar convite'}
      </Button>
    </form>
  )
}
