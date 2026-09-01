import { ProgressBar } from '@/components/progress/progress-bar'
import { getDashboard } from '@/server/dashboard'

export const metadata = { title: 'Progresso — GEX Academy' }

export default async function ProgressoPage() {
  const { pessoas, cursos } = await getDashboard()
  const onboardingPendente = pessoas.filter((p) => !p.onboardingConcluido)

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h1 className="text-xl font-semibold">Progresso</h1>
        <p className="mt-1 text-sm text-texto-suave">
          {onboardingPendente.length === 0
            ? 'Todo mundo concluiu a trilha inicial.'
            : `${onboardingPendente.length} ${onboardingPendente.length === 1 ? 'pessoa ainda não concluiu' : 'pessoas ainda não concluíram'} a trilha inicial.`}
        </p>
      </section>

      {onboardingPendente.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-texto-suave">
            Trilha inicial pendente
          </h2>
          <ul className="divide-y divide-borda rounded-card border border-borda bg-superficie">
            {onboardingPendente.map((pessoa) => (
              <li key={pessoa.userId} className="px-4 py-3 text-sm">
                {pessoa.name}
                <span className="text-xs text-texto-suave">
                  {pessoa.areaName ? ` · ${pessoa.areaName}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-texto-suave">
          Por pessoa
        </h2>
        <ul className="divide-y divide-borda rounded-card border border-borda bg-superficie">
          {pessoas.map((pessoa) => (
            <li key={pessoa.userId} className="px-4 py-3">
              <p className="text-sm font-medium">
                {pessoa.name}
                <span className="ml-2 text-xs font-normal text-texto-suave">
                  {pessoa.areaName ?? 'Sem área'}
                </span>
              </p>
              <div className="mt-2 max-w-md">
                <ProgressBar completed={pessoa.concluidas} total={pessoa.disponiveis} />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-texto-suave">
          Por curso
        </h2>
        <ul className="divide-y divide-borda rounded-card border border-borda bg-superficie">
          {cursos.map((curso) => (
            <li key={curso.courseId} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1">
                <p className="text-sm font-medium">{curso.title}</p>
                <p className="text-xs text-texto-suave">{curso.areaName ?? 'Sem área'}</p>
              </div>
              <p className="text-sm">
                {curso.concluiram} de {curso.comAcesso}
                <span className="ml-2 text-xs text-texto-suave">({curso.percent}%)</span>
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
