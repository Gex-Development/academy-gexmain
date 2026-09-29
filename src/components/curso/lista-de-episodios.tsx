import Link from 'next/link'
import { cn } from '@/lib/cn'
import { formatDuration } from '@/lib/format'
import type { EstadoDaAula } from '@/lib/progress/proxima-aula'
import type { CourseView } from '@/server/viewer'

const SELO: Record<EstadoDaAula, { texto: string; classe: string }> = {
  concluida: { texto: 'Concluída', classe: 'border-sucesso/40 text-sucesso' },
  assistindo: { texto: 'Assistindo', classe: 'border-selecionado-borda bg-selecionado text-selecionado-texto' },
  'nao-iniciada': { texto: 'Não iniciada', classe: 'border-vidro-borda text-texto-suave' },
}

/**
 * Aulas do curso como lista de episódios (spec, seção 7). A versão
 * `compacta` (sem miniatura nem selo) é a lista lateral da sala de aula.
 * O destaque é da `aulaAtualId` quando informada (sala de aula: a aula aberta);
 * senão, da aula no estado "assistindo" (página do curso: a próxima).
 */
export function ListaDeEpisodios({
  courseSlug,
  aulas,
  estados,
  capaUrl,
  aulaAtualId,
  compacta = false,
}: {
  courseSlug: string
  aulas: CourseView['lessons']
  estados: EstadoDaAula[]
  capaUrl: string | null
  aulaAtualId?: string
  compacta?: boolean
}) {
  if (aulas.length === 0) {
    return <p className="p-4 text-center text-sm text-texto-suave">Este curso ainda não tem aulas publicadas.</p>
  }

  return (
    <ol className="divide-y divide-vidro-borda">
      {aulas.map((aula, i) => {
        const estado = estados[i]!
        const atual = aulaAtualId ? aula.id === aulaAtualId : estado === 'assistindo'
        return (
          <li key={aula.id}>
            <Link
              href={`/curso/${courseSlug}/aula/${aula.slug}`}
              aria-current={atual ? 'true' : undefined}
              className={cn(
                'flex items-center gap-3 transition-colors hover:bg-vidro',
                compacta ? 'px-4 py-2.5' : 'px-4 py-3',
                atual && 'bg-selecionado shadow-[inset_2px_0_0_var(--color-ciano)]',
              )}
            >
              <span className="w-6 shrink-0 text-sm tabular-nums text-texto-suave">{i + 1}</span>
              {!compacta && (
                <div
                  className={cn(
                    'hidden aspect-video w-24 shrink-0 overflow-hidden rounded-md sm:block',
                    capaUrl ? 'bg-capa-fundo' : 'bg-gradient-to-br from-azul to-ciano',
                  )}
                >
                  {capaUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={capaUrl} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className={cn('truncate text-sm', atual ? 'font-semibold text-texto' : 'text-texto')}>{aula.title}</p>
                {aula.durationSeconds ? (
                  <p className="text-xs text-texto-suave">{formatDuration(aula.durationSeconds)}</p>
                ) : null}
              </div>
              {compacta ? (
                estado === 'concluida' && (
                  <span className="text-sm text-sucesso">
                    <span aria-hidden>✓</span>
                    <span className="sr-only">Concluída</span>
                  </span>
                )
              ) : (
                <span className={cn('shrink-0 rounded-full border px-2.5 py-0.5 text-xs', SELO[estado].classe)}>
                  {SELO[estado].texto}
                </span>
              )}
            </Link>
          </li>
        )
      })}
    </ol>
  )
}
