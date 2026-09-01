'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { VideoPlayer } from '@/components/video/video-player'
import { parseVideoInput } from '@/lib/video'
import { setLessonStatus, updateLesson, type LessonRow } from '@/server/lessons'

export function LessonForm({ lesson }: { lesson: LessonRow }) {
  const [videoInput, setVideoInput] = useState(
    lesson.provider === 'youtube'
      ? `https://www.youtube.com/watch?v=${lesson.ref}`
      : lesson.ref,
  )
  const preview = parseVideoInput(videoInput)

  const [saveState, saveAction, saving] = useActionState(updateLesson, null)
  const [statusState, statusAction, changing] = useActionState(setLessonStatus, null)
  const publicando = lesson.status === 'draft'

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_360px]">
      <form action={saveAction} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={lesson.id} />

        <Field label="Título da aula" htmlFor="title">
          <Input id="title" name="title" defaultValue={lesson.title} required maxLength={120} />
        </Field>

        <Field
          label="Vídeo"
          htmlFor="video"
          hint="Cole o link do YouTube ou o código de incorporação do VTurb."
          error={!videoInput || preview ? undefined : 'Não reconhecemos esse vídeo.'}
        >
          <textarea
            id="video"
            name="video"
            required
            rows={3}
            value={videoInput}
            onChange={(e) => setVideoInput(e.target.value)}
            className="w-full rounded-lg border border-borda bg-superficie px-3 py-2 font-mono text-xs"
          />
        </Field>

        <p className="rounded-lg bg-aviso/10 p-3 text-xs text-aviso">
          <strong>Conteúdo confidencial?</strong> Vídeo “não listado” no YouTube é acessível por
          qualquer pessoa com o link — ele fica escondido, não protegido. Para números, processos
          internos ou contratos, use o VTurb com trava de domínio.
        </p>

        <Field label="Descrição" htmlFor="description" hint="Texto simples, sem formatação">
          <textarea
            id="description"
            name="description"
            rows={6}
            defaultValue={lesson.description ?? ''}
            maxLength={4000}
            className="w-full rounded-lg border border-borda bg-superficie px-3 py-2 text-sm"
          />
        </Field>

        <Field label="Duração em minutos" htmlFor="durationMinutes" hint="Opcional">
          <Input
            id="durationMinutes"
            name="durationMinutes"
            type="number"
            min={0}
            max={600}
            defaultValue={lesson.durationSeconds ? Math.round(lesson.durationSeconds / 60) : ''}
          />
        </Field>

        {saveState && !saveState.ok && (
          <p role="alert" className="text-xs text-perigo">
            {saveState.error}
          </p>
        )}
        {saveState?.ok && <p className="text-xs text-sucesso">Aula salva.</p>}

        <Button type="submit" disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar aula'}
        </Button>
      </form>

      <aside className="flex flex-col gap-4">
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-texto-suave">
            Prévia
          </h2>
          {preview ? (
            <VideoPlayer provider={preview.provider} videoRef={preview.ref} title={lesson.title} />
          ) : (
            <p className="rounded-card border border-dashed border-borda p-6 text-center text-xs text-texto-suave">
              Cole um vídeo válido para ver a prévia.
            </p>
          )}
        </div>

        <form action={statusAction} className="rounded-card border border-borda bg-superficie p-4">
          <input type="hidden" name="id" value={lesson.id} />
          <input type="hidden" name="status" value={publicando ? 'published' : 'draft'} />
          <p className="mb-2 text-xs text-texto-suave">
            {publicando
              ? 'Aula em rascunho: invisível para os alunos.'
              : 'Aula publicada e visível para quem tem acesso ao curso.'}
          </p>
          {statusState && !statusState.ok && (
            <p role="alert" className="mb-2 text-xs text-perigo">
              {statusState.error}
            </p>
          )}
          <Button type="submit" variant="secundario" disabled={changing}>
            {publicando ? 'Publicar aula' : 'Voltar para rascunho'}
          </Button>
        </form>
      </aside>
    </div>
  )
}
