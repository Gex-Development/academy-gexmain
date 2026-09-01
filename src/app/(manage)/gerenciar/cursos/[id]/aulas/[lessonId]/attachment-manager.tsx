'use client'

import { useActionState, useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { ALLOWED_ATTACHMENT_MIME, ATTACHMENT_BUCKET, validateAttachment } from '@/lib/storage/attachments'
import { createBrowserSupabase } from '@/lib/supabase/client'
import {
  confirmAttachmentUpload,
  createAttachmentUpload,
  deleteAttachment,
  type AttachmentRow,
} from '@/server/attachments'

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
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [enviando, setEnviando] = useState(false)
  const [erroEnvio, setErroEnvio] = useState<string | null>(null)
  const [deleteState, deleteAction] = useActionState(deleteAttachment, null)

  // O upload não cabe num único <form action={...}> de Server Action: o
  // arquivo sobe direto do navegador para o Storage (uploadToSignedUrl),
  // entre autorizar/mintar (createAttachmentUpload) e confirmar/gravar a
  // linha (confirmAttachmentUpload). Por isso a orquestração é manual aqui,
  // não useActionState — mas as duas actions continuam recebendo FormData e
  // devolvendo ActionResult, como o resto do projeto.
  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const form = evento.currentTarget
    const input = form.elements.namedItem('file') as HTMLInputElement | null
    const file = input?.files?.[0]
    if (!file) return

    // Mesma função pura que o servidor usa (validateAttachment), rodada aqui
    // antes de mintar: dá a mensagem específica — tipo errado, acima de
    // 50 MB — na hora, sem esperar o round-trip do mint. Não é a barreira de
    // verdade (createAttachmentUpload e verifyAndRegisterAttachment validam
    // de novo no servidor, contra o que o Storage realmente recebeu) — é só
    // o motivo de o erro de uploadToSignedUrl, mais abaixo, poder continuar
    // genérico: o caso específico já foi pego aqui.
    const erroValidacao = validateAttachment({ name: file.name, type: file.type, size: file.size })
    if (erroValidacao) {
      setErroEnvio(erroValidacao)
      return
    }

    setEnviando(true)
    setErroEnvio(null)
    try {
      const mintForm = new FormData()
      mintForm.set('lessonId', lessonId)
      mintForm.set('fileName', file.name)
      mintForm.set('mimeType', file.type)
      mintForm.set('sizeBytes', String(file.size))

      const mint = await createAttachmentUpload(null, mintForm)
      if (!mint.ok) {
        setErroEnvio(mint.error)
        return
      }

      const browser = createBrowserSupabase()
      const { error: erroUpload } = await browser.storage
        .from(ATTACHMENT_BUCKET)
        .uploadToSignedUrl(mint.data.path, mint.data.token, file, { contentType: file.type })
      if (erroUpload) {
        setErroEnvio('Não foi possível enviar o arquivo. Tente novamente.')
        return
      }

      const confirmForm = new FormData()
      confirmForm.set('lessonId', lessonId)
      confirmForm.set('path', mint.data.path)
      confirmForm.set('fileName', file.name)

      const confirmado = await confirmAttachmentUpload(null, confirmForm)
      if (!confirmado.ok) {
        setErroEnvio(confirmado.error)
        return
      }

      formRef.current?.reset()
      router.refresh()
    } finally {
      setEnviando(false)
    }
  }

  const erro = erroEnvio || (!deleteState?.ok && deleteState?.error)

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

      <form ref={formRef} onSubmit={enviar} className="flex flex-col gap-3">
        <Field label="Novo material" htmlFor="file" hint="Até 50 MB. PDF, Word, Excel, PowerPoint, CSV, ZIP ou imagem.">
          <input id="file" name="file" type="file" required accept={ACCEPT} className="text-xs" />
        </Field>
        {erro && (
          <p role="alert" className="text-xs text-perigo">
            {erro}
          </p>
        )}
        <Button type="submit" variant="secundario" disabled={enviando}>
          {enviando ? 'Enviando…' : 'Anexar'}
        </Button>
      </form>
    </div>
  )
}
