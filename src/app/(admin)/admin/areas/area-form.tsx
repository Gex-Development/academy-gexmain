'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { createArea } from '@/server/areas'

export function AreaForm() {
  const [state, action, pending] = useActionState(createArea, null)

  return (
    <form action={action} className="flex flex-col gap-4 rounded-card border border-borda bg-superficie p-4">
      <Field label="Nome" htmlFor="name" hint="Ex.: Gestão de Tráfego">
        <Input id="name" name="name" required maxLength={60} />
      </Field>
      <Field label="Descrição" htmlFor="description">
        <Input id="description" name="description" maxLength={280} />
      </Field>
      <Field label="Cor" htmlFor="color" hint="Formato #RRGGBB">
        <Input id="color" name="color" placeholder="#2F6BFF" />
      </Field>
      <Field label="Posição" htmlFor="position" hint="Ordem na vitrine">
        <Input id="position" name="position" type="number" min={0} max={999} defaultValue={0} />
      </Field>

      {state && !state.ok && (
        <p role="alert" className="text-xs text-perigo">
          {state.error}
        </p>
      )}
      {state?.ok && <p className="text-xs text-sucesso">Área criada.</p>}

      <Button type="submit" disabled={pending}>
        {pending ? 'Salvando…' : 'Criar área'}
      </Button>
    </form>
  )
}
