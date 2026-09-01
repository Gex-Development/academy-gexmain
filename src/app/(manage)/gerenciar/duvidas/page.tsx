import Link from 'next/link'
import { listPendingQuestions } from '@/server/forum'

export const metadata = { title: 'Dúvidas — GEX Academy' }

const formatador = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
})

export default async function DuvidasPage() {
  const questions = await listPendingQuestions()

  const semResposta = questions.filter((q) => q.answerCount === 0)
  const comResposta = questions.filter((q) => q.answerCount > 0)

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-semibold">Dúvidas em aberto</h1>
      <p className="mb-6 mt-1 text-sm text-texto-suave">
        {semResposta.length} sem resposta · {comResposta.length} respondidas mas ainda não resolvidas
      </p>

      {questions.length === 0 ? (
        <p className="text-sm text-texto-suave">Nenhuma dúvida em aberto. Tudo em dia.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {[...semResposta, ...comResposta].map((question) => (
            <li key={question.id} className="rounded-card border border-borda bg-superficie p-4">
              <p className="text-xs text-texto-suave">
                <span className="font-medium text-texto">{question.authorName}</span> ·{' '}
                {question.courseTitle} / {question.lessonTitle} ·{' '}
                {formatador.format(new Date(question.createdAt))}
                {question.answerCount === 0 && (
                  <span className="ml-2 rounded-full bg-aviso/10 px-2 py-0.5 text-[10px] text-aviso">
                    sem resposta
                  </span>
                )}
              </p>
              <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm">{question.body}</p>
              <Link
                href={`/curso/${question.courseSlug}/aula/${question.lessonSlug}`}
                className="mt-2 inline-block text-xs text-marca-600 hover:underline"
              >
                Abrir a aula e responder →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
