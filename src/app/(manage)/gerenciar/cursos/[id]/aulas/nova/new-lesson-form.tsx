'use client'

import { useRouter } from 'next/navigation'
import { useActionState, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { parseVideoInput } from '@/lib/video'
import { createLesson } from '@/server/lessons'

/*
 * Os mesmos campos do formulário de edição (lesson-form.tsx), sem o painel
 * de publicação e sem a prévia do vídeo — os dois só fazem sentido para uma
 * aula que já existe.
 *
 * Componente separado, e não uma generalização do de edição, de propósito:
 * lá o estado do vídeo alimenta o player da prévia, e compartilhar isso
 * custaria mais fiação do que os quatro campos repetidos aqui. Se os dois
 * começarem a divergir de verdade, aí sim vale extrair os campos.
 */
export function NewLessonForm({ courseId }: { courseId: string }) {
  const router = useRouter()
  const [state, action, pending] = useActionState(createLesson, null)
  const [videoInput, setVideoInput] = useState('')
  const videoReconhecido = parseVideoInput(videoInput)

  // Criada a aula, vai para a página dela — que é onde ficam os ANEXOS.
  // Depende de `ok`, nunca de "a action respondeu": vídeo não reconhecido
  // volta como erro, e navegar aí tiraria a pessoa da tela antes de ela ler
  // a mensagem.
  useEffect(() => {
    if (state?.ok) router.push(`/gerenciar/cursos/${courseId}/aulas/${state.data.id}`)
  }, [state, courseId, router])

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-4">
      <input type="hidden" name="courseId" value={courseId} />

      <Field label="Título da aula" htmlFor="title">
        <Input id="title" name="title" required minLength={3} maxLength={120} />
      </Field>

      <Field
        label="Vídeo"
        htmlFor="video"
        hint="Cole o link do YouTube ou o código de incorporação do VTurb."
        error={!videoInput || videoReconhecido ? undefined : 'Não reconhecemos esse vídeo.'}
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
          maxLength={4000}
          className="w-full rounded-lg border border-borda bg-superficie px-3 py-2 text-sm"
        />
      </Field>

      <Field label="Duração em minutos" htmlFor="durationMinutes" hint="Opcional">
        <Input id="durationMinutes" name="durationMinutes" type="number" min={0} max={600} />
      </Field>

      <p className="text-xs text-texto-suave">
        A aula nasce como rascunho — invisível para os alunos. Depois de salvar você anexa o
        material e publica.
      </p>

      {state && !state.ok && (
        <p role="alert" className="text-xs text-perigo">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? 'Criando…' : 'Criar aula'}
      </Button>
    </form>
  )
}
