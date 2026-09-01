import { progressPercent } from '@/lib/progress/percent'

export function ProgressBar({ completed, total }: { completed: number; total: number }) {
  const percent = progressPercent(completed, total)

  return (
    <div>
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${percent}% concluído`}
        className="h-1.5 w-full overflow-hidden rounded-full bg-borda"
      >
        <div className="h-full bg-marca-500" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-1 text-xs text-texto-suave">
        {completed} de {total} {total === 1 ? 'aula concluída' : 'aulas concluídas'} · {percent}%
      </p>
    </div>
  )
}
