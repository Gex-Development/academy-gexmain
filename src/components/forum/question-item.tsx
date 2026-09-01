'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  answerQuestion,
  deleteAnswer,
  deleteQuestion,
  togglePinned,
  toggleResolved,
  type ForumQuestion,
} from '@/server/forum'

const formatador = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
})

function Selo({ children }: { children: string }) {
  return (
    <span className="rounded-full bg-marca-50 px-2 py-0.5 text-[10px] font-medium text-marca-700">
      {children}
    </span>
  )
}

export function QuestionItem({ question }: { question: ForumQuestion }) {
  const [answerState, answerAction, answering] = useActionState(answerQuestion, null)
  const [pinState, pinAction] = useActionState(togglePinned, null)
  const [resolveState, resolveAction] = useActionState(toggleResolved, null)
  const [deleteQuestionState, deleteQuestionAction] = useActionState(deleteQuestion, null)
  const [deleteAnswerState, deleteAnswerAction] = useActionState(deleteAnswer, null)

  // moderar() (src/server/forum.ts) confere as linhas afetadas justamente
  // porque uma recusa de RLS chega como zero linhas e não como erro — sem
  // mostrar esse `state` aqui, a tela não diria nada quando o banco recusa a
  // ação: o botão volta ao normal, nada muda, ninguém sabe por quê.
  //
  // Uma única mensagem para as três ações de moderação (fixar/desafixar,
  // resolver/reabrir, excluir pergunta) — mas não basta pegar o primeiro
  // `state` verdadeiro entre os três: pin/resolve/deleteQuestion são três
  // useActionState INDEPENDENTES, e o componente não é remontado na
  // revalidação. Um "fixar" que falha seguido de um "resolver" que dá certo
  // deixaria a mensagem do "fixar" na tela — os três nunca rodam ao MESMO
  // TEMPO, mas o resultado de cada um PERSISTE até a próxima vez que aquele
  // botão específico for clicado, não até a próxima ação de moderação
  // qualquer. `ultimaAcaoModeracao`, atualizado no onSubmit de cada
  // formulário, marca qual dos três estados é o que vale agora — os outros
  // dois, mesmo com erro guardado, são ignorados.
  const [ultimaAcaoModeracao, setUltimaAcaoModeracao] = useState<
    'fixar' | 'resolver' | 'excluir-pergunta' | null
  >(null)
  const erroModeracao =
    (ultimaAcaoModeracao === 'fixar' && pinState && !pinState.ok && pinState.error) ||
    (ultimaAcaoModeracao === 'resolver' && resolveState && !resolveState.ok && resolveState.error) ||
    (ultimaAcaoModeracao === 'excluir-pergunta' &&
      deleteQuestionState &&
      !deleteQuestionState.ok &&
      deleteQuestionState.error) ||
    undefined

  return (
    <li className="rounded-card border border-borda bg-superficie p-4">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <p className="flex flex-wrap items-center gap-2 text-xs text-texto-suave">
            <span className="font-medium text-texto">{question.author.name}</span>
            {question.author.isInstructor && <Selo>Professor</Selo>}
            {question.isPinned && <Selo>Fixada</Selo>}
            {question.resolved && <Selo>Resolvida</Selo>}
            <span>{formatador.format(new Date(question.createdAt))}</span>
          </p>
          {/* Texto puro: whitespace-pre-line preserva quebras sem interpretar marcação. */}
          <p className="mt-2 whitespace-pre-line text-sm">{question.body}</p>
        </div>

        <div className="flex shrink-0 gap-1">
          {question.canModerate && (
            <>
              <form action={pinAction} onSubmit={() => setUltimaAcaoModeracao('fixar')}>
                <input type="hidden" name="questionId" value={question.id} />
                <Button type="submit" variant="secundario" className="px-2 py-0.5 text-xs">
                  {question.isPinned ? 'Desafixar' : 'Fixar'}
                </Button>
              </form>
              <form action={resolveAction} onSubmit={() => setUltimaAcaoModeracao('resolver')}>
                <input type="hidden" name="questionId" value={question.id} />
                <Button type="submit" variant="secundario" className="px-2 py-0.5 text-xs">
                  {question.resolved ? 'Reabrir' : 'Resolver'}
                </Button>
              </form>
            </>
          )}
          {(question.canDelete || question.canModerate) && (
            <form
              action={deleteQuestionAction}
              onSubmit={(e) => {
                if (!confirm('Excluir esta pergunta e as respostas dela?')) {
                  e.preventDefault()
                  return
                }
                setUltimaAcaoModeracao('excluir-pergunta')
              }}
            >
              <input type="hidden" name="questionId" value={question.id} />
              <Button type="submit" variant="perigo" className="px-2 py-0.5 text-xs">
                Excluir
              </Button>
            </form>
          )}
        </div>
      </div>

      {erroModeracao && (
        <p role="alert" className="mt-2 text-xs text-perigo">
          {erroModeracao}
        </p>
      )}

      {question.answers.length > 0 && (
        <ul className="mt-4 flex flex-col gap-3 border-l-2 border-borda pl-4">
          {question.answers.map((answer) => (
            <li key={answer.id} className="flex items-start gap-2">
              <div className="flex-1">
                <p className="flex flex-wrap items-center gap-2 text-xs text-texto-suave">
                  <span className="font-medium text-texto">{answer.author.name}</span>
                  {answer.author.isInstructor && <Selo>Professor</Selo>}
                  <span>{formatador.format(new Date(answer.createdAt))}</span>
                </p>
                <p className="mt-1 whitespace-pre-line text-sm">{answer.body}</p>
              </div>
              {answer.canDelete && (
                <form action={deleteAnswerAction}>
                  <input type="hidden" name="answerId" value={answer.id} />
                  <Button type="submit" variant="secundario" className="px-2 py-0.5 text-xs">
                    Excluir
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {deleteAnswerState && !deleteAnswerState.ok && (
        <p role="alert" className="mt-2 text-xs text-perigo">
          {deleteAnswerState.error}
        </p>
      )}

      <form action={answerAction} className="mt-4 flex flex-col gap-2">
        <input type="hidden" name="questionId" value={question.id} />
        <label htmlFor={`resposta-${question.id}`} className="sr-only">
          Responder
        </label>
        <textarea
          id={`resposta-${question.id}`}
          name="body"
          rows={2}
          required
          maxLength={4000}
          placeholder="Escreva uma resposta…"
          className="w-full rounded-lg border border-borda bg-superficie px-3 py-2 text-sm"
        />
        {answerState && !answerState.ok && (
          <p role="alert" className="text-xs text-perigo">
            {answerState.error}
          </p>
        )}
        <Button type="submit" variant="secundario" disabled={answering} className="self-start">
          {answering ? 'Enviando…' : 'Responder'}
        </Button>
      </form>
    </li>
  )
}
