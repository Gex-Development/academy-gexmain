'use client'

import { useRouter } from 'next/navigation'
import { useActionState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import type { AreaRow } from '@/server/areas'
import { createCourse } from '@/server/courses'

export function CourseForm({ areas, isAdmin }: { areas: AreaRow[]; isAdmin: boolean }) {
  const router = useRouter()
  const [state, action, pending] = useActionState(createCourse, null)

  useEffect(() => {
    if (state?.ok) router.push(`/gerenciar/cursos/${state.data.id}`)
  }, [state, router])

  return (
    <form action={action} className="flex flex-col gap-4 rounded-card border border-borda bg-superficie p-4">
      <Field label="Título" htmlFor="title">
        <Input id="title" name="title" required minLength={3} maxLength={120} />
      </Field>
      <Field label="Descrição" htmlFor="description" hint="Aparece também no card bloqueado">
        <Input id="description" name="description" maxLength={600} />
      </Field>
      <Field label="URL da capa" htmlFor="coverUrl" hint="Opcional">
        <Input id="coverUrl" name="coverUrl" type="url" />
      </Field>

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
