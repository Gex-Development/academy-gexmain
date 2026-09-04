'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { CoverField } from '@/components/ui/cover-field'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { setCourseStatus, updateCourse, type ManagedCourse } from '@/server/courses'

export function CourseSettings({ course }: { course: ManagedCourse }) {
  const [saveState, saveAction, saving] = useActionState(updateCourse, null)
  const [statusState, statusAction, changing] = useActionState(setCourseStatus, null)
  const publicando = course.status === 'draft'

  return (
    <div className="flex flex-col gap-6 rounded-card border border-borda bg-superficie p-4">
      <form action={saveAction} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={course.id} />
        <Field label="Título" htmlFor="title">
          <Input id="title" name="title" defaultValue={course.title} required maxLength={120} />
        </Field>
        <Field label="Descrição" htmlFor="description">
          <Input id="description" name="description" defaultValue={course.description ?? ''} maxLength={600} />
        </Field>
        <CoverField
          name="coverUrl"
          largura={1280}
          altura={800}
          defaultValue={course.coverUrl ?? ''}
          escopo="curso"
          entidadeId={course.id}
        />
        {saveState && !saveState.ok && (
          <p role="alert" className="text-xs text-perigo">
            {saveState.error}
          </p>
        )}
        {saveState?.ok && <p className="text-xs text-sucesso">Curso salvo.</p>}
        <Button type="submit" variant="secundario" disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar alterações'}
        </Button>
      </form>

      <form action={statusAction} className="border-t border-borda pt-4">
        <input type="hidden" name="id" value={course.id} />
        <input type="hidden" name="status" value={publicando ? 'published' : 'draft'} />
        <p className="mb-2 text-xs text-texto-suave">
          {publicando
            ? 'Publicar deixa o curso visível na vitrine de toda a empresa.'
            : 'Despublicar tira o curso da vitrine. O progresso dos alunos é preservado.'}
        </p>
        {statusState && !statusState.ok && (
          <p role="alert" className="mb-2 text-xs text-perigo">
            {statusState.error}
          </p>
        )}
        <Button type="submit" disabled={changing}>
          {publicando ? 'Publicar curso' : 'Voltar para rascunho'}
        </Button>
      </form>
    </div>
  )
}
