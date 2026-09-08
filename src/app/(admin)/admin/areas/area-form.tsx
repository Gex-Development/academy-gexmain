'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { CoverField } from '@/components/ui/cover-field'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { createArea } from '@/server/areas'

export function AreaForm({ novoId }: { novoId: string }) {
  const [state, action, pending] = useActionState(createArea, null)

  return (
    <form action={action} className="flex flex-col gap-4 rounded-card border border-borda bg-superficie p-4">
      {/* Vai junto na gravação: é o id que a área vai ter, e a pasta onde a
          capa já foi enviada. */}
      <input type="hidden" name="id" value={novoId} />
      <Field label="Nome" htmlFor="name" hint="Ex.: Gestão de Tráfego">
        <Input id="name" name="name" required maxLength={60} />
      </Field>
      <Field label="Descrição" htmlFor="description">
        <Input id="description" name="description" maxLength={280} />
      </Field>
      <Field label="Cor" htmlFor="color" hint="Formato #RRGGBB">
        <Input id="color" name="color" placeholder="#2F6BFF" />
      </Field>
      {/*
        A `key` é o id da área que está sendo criada. Ele muda quando uma
        criação dá certo — createArea revalida esta rota, a página roda de
        novo no servidor e manda um id novo —, e trocar a key força o React a
        REMONTAR o CoverField em vez de reaproveitar a instância.

        Sem isto: CoverField guarda a URL num useState interno (input
        controlado), e o reset automático que o React 19 faz nos campos não
        controlados depois de uma action bem-sucedida não alcança esse estado
        — a URL continuava na caixa e a próxima área herdava a capa da
        anterior em silêncio. Erro de validação não muda a key, então o que a
        pessoa já tinha preenchido continua lá.
      */}
      <CoverField
        key={novoId}
        name="coverUrl"
        largura={1600}
        altura={1000}
        escopo="area"
        entidadeId={novoId}
      />
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
