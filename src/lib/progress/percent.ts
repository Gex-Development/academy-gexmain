export type CourseProgress = { completed: number; total: number; percent: number }

/** Percentual de conclusão, sempre entre 0 e 100. */
export function progressPercent(completed: number, total: number): number {
  if (total <= 0 || completed <= 0) return 0
  return Math.min(100, Math.round((completed / total) * 100))
}

/**
 * Empacota contagem e percentual.
 * Mora aqui, e não em `src/server/progress.ts`, porque todo export de um
 * arquivo 'use server' precisa ser função async — e esta é síncrona.
 */
export function buildProgress(completed: number, total: number): CourseProgress {
  return { completed, total, percent: progressPercent(completed, total) }
}
