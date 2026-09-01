'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { ALLOWED_ATTACHMENT_MIME } from '@/lib/storage/attachments'
import { deleteAttachment, uploadAttachment, type AttachmentRow } from '@/server/attachments'

const ACCEPT = Object.keys(ALLOWED_ATTACHMENT_MIME).join(',')

function formatarTamanho(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function AttachmentManager({
  lessonId,
  attachments,
}: {
  lessonId: string
  attachments: AttachmentRow[]
}) {
  const [uploadState, uploadAction, uploading] = useActionState(uploadAttachment, null)
  const [deleteState, deleteAction] = useActionState(deleteAttachment, null)
  const erro = (!uploadState?.ok && uploadState?.error) || (!deleteState?.ok && deleteState?.error)

  return (
    <div className="rounded-card border border-borda bg-superficie p-4">
      <h2 className="mb-3 text-sm font-semibold">Materiais</h2>

      <ul className="mb-4 divide-y divide-borda">
        {attachments.length === 0 && (
          <li className="py-2 text-xs text-texto-suave">Nenhum material anexado.</li>
        )}
        {attachments.map((anexo) => (
          <li key={anexo.id} className="flex items-center gap-2 py-2">
            <a
              href={`/api/anexos/${anexo.id}`}
              className="flex-1 truncate text-xs text-marca-600 hover:underline"
            >
              {anexo.fileName}
            </a>
            <span className="text-xs text-texto-suave">{formatarTamanho(anexo.sizeBytes)}</span>
            <form action={deleteAction}>
              <input type="hidden" name="id" value={anexo.id} />
              <Button type="submit" variant="perigo" className="px-2 py-0.5 text-xs">
                Excluir
              </Button>
            </form>
          </li>
        ))}
      </ul>

      <form action={uploadAction} className="flex flex-col gap-3">
        <input type="hidden" name="lessonId" value={lessonId} />
        <Field label="Novo material" htmlFor="file" hint="Até 50 MB. PDF, Word, Excel, PowerPoint, CSV, ZIP ou imagem.">
          <input id="file" name="file" type="file" required accept={ACCEPT} className="text-xs" />
        </Field>
        {erro && (
          <p role="alert" className="text-xs text-perigo">
            {erro}
          </p>
        )}
        <Button type="submit" variant="secundario" disabled={uploading}>
          {uploading ? 'Enviando…' : 'Anexar'}
        </Button>
      </form>
    </div>
  )
}
