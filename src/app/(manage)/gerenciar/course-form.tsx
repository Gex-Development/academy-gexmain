'use client'

import { useRouter } from 'next/navigation'
import { useActionState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { CoverField } from '@/components/ui/cover-field'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import type { AreaRow } from '@/server/areas'
import { createCourse } from '@/server/courses'

export function CourseForm({
  areas,
  isAdmin,
  novoId,
}: {
  areas: AreaRow[]
  isAdmin: boolean
  novoId: string
}) {
  const router = useRouter()
  const [state, action, pending] = useActionState(createCourse, null)

  useEffect(() => {
    if (state?.ok) router.push(`/gerenciar/cursos/${state.data.id}`)
  }, [state, router])

  return (
    <form action={action} className="flex flex-col gap-4 rounded-card border border-borda bg-superficie p-4">
      {/* Vai junto na gravação: é o id que o curso vai ter, e a pasta onde a
          capa já foi enviada. */}
      <input type="hidden" name="id" value={novoId} />
      <Field label="Título" htmlFor="title">
        <Input id="title" name="title" required minLength={3} maxLength={120} />
      </Field>
      <Field label="Descrição" htmlFor="description" hint="Aparece também no card bloqueado">
        <Input id="description" name="description" maxLength={600} />
      </Field>
      {/*
        Era uma caixa de texto solta: dava para colar uma URL, e só. Sem
        prévia, sem a medida à vista e sem upload — quem fosse fazer a arte
        descobria a proporção errada depois de publicar. Agora é o mesmo
        campo do curso já criado e do formulário de área.

        A `key` é o id: quando um curso é criado, createCourse revalida esta
        rota, a página manda um id novo e o CoverField REMONTA — sem isso a
        URL da capa fica no estado interno dele e o próximo curso nasceria
        herdando a imagem do anterior.
      */}
      <CoverField
        key={novoId}
        id="coverUrl"
        name="coverUrl"
        largura={1280}
        altura={800}
        escopo="curso"
        entidadeId={novoId}
      />

      {isAdmin && (
        <>
          <Field label="Área" htmlFor="areaId">
            <select
              id="areaId"
              name="areaId"
              className="w-full rounded-lg border border-borda bg-superficie px-3 py-2 text-sm"
            >
              <option value="">Escolha a área</option>
              {areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isOnboarding" />
            É a trilha inicial da empresa
          </label>
        </>
      )}

      {state && !state.ok && (
        <p role="alert" className="text-xs text-perigo">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? 'Criando…' : 'Criar curso'}
      </Button>
    </form>
  )
}
