'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { CoverField } from '@/components/ui/cover-field'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { updateArea, type AreaRow as Area } from '@/server/areas'

export function AreaRow({ area }: { area: Area }) {
  const [aberto, setAberto] = useState(false)
  const [state, action, pending] = useActionState(updateArea, null)

  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="size-3 rounded-full border border-borda"
          style={{ backgroundColor: area.color ?? 'transparent' }}
        />
        <div className="flex-1">
          <p className="text-sm font-medium">{area.name}</p>
          <p className="text-xs text-texto-suave">
            /{area.slug}
            {!area.coverUrl && ' · sem capa'}
          </p>
        </div>
        <span className="text-xs text-texto-suave">posição {area.position}</span>
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="text-xs text-marca-600 hover:underline"
        >
          {aberto ? 'Fechar' : 'Editar'}
        </button>
      </div>

      {aberto && (
        <form action={action} className="mt-4 flex flex-col gap-4 border-t border-borda pt-4">
          <input type="hidden" name="id" value={area.id} />
          <Field label="Nome" htmlFor={`name-${area.id}`}>
            <Input id={`name-${area.id}`} name="name" required maxLength={60} defaultValue={area.name} />
          </Field>
          <Field label="Descrição" htmlFor={`description-${area.id}`}>
            <Input
              id={`description-${area.id}`}
              name="description"
              maxLength={280}
              defaultValue={area.description ?? ''}
            />
          </Field>
          <CoverField
            name="coverUrl"
            largura={1600}
            altura={1000}
            defaultValue={area.coverUrl ?? ''}
          />
          <Field label="Cor" htmlFor={`color-${area.id}`} hint="Formato #RRGGBB — usada quando não há capa">
            <Input id={`color-${area.id}`} name="color" defaultValue={area.color ?? ''} placeholder="#004EAC" />
          </Field>
          <Field label="Posição" htmlFor={`position-${area.id}`} hint="Ordem na vitrine">
            <Input
              id={`position-${area.id}`}
              name="position"
              type="number"
              min={0}
              max={999}
              defaultValue={area.position}
            />
          </Field>

          {state && !state.ok && (
            <p role="alert" className="text-xs text-perigo">
              {state.error}
            </p>
          )}
          {state?.ok && <p className="text-xs text-sucesso">Área salva.</p>}

          <Button type="submit" disabled={pending}>
            {pending ? 'Salvando…' : 'Salvar'}
          </Button>
        </form>
      )}
    </li>
  )
}
