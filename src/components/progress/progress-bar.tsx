import { cn } from '@/lib/cn'
import { progressPercent } from '@/lib/progress/percent'

export function ProgressBar({
  completed,
  total,
  tom = 'padrao',
}: {
  completed: number
  total: number
  /** 'sobre-imagem': texto e trilho claros, para usar em cima de capa escurecida — em qualquer tema. */
  tom?: 'padrao' | 'sobre-imagem'
}) {
  const percent = progressPercent(completed, total)

  return (
    <div>
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${percent}% concluído`}
        className={cn('h-1.5 w-full overflow-hidden rounded-full', tom === 'sobre-imagem' ? 'bg-white/20' : 'bg-borda')}
      >
        <div className="h-full bg-gradient-to-r from-azul to-ciano" style={{ width: `${percent}%` }} />
      </div>
      <p className={cn('mt-1 text-xs', tom === 'sobre-imagem' ? 'text-white/75' : 'text-texto-suave')}>
        {completed} de {total} {total === 1 ? 'aula concluída' : 'aulas concluídas'} · {percent}%
      </p>
    </div>
  )
}
