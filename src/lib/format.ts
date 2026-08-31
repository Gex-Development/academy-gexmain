/** Formata uma duração em segundos para exibição em cards e listas de aula. */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds <= 0) return '—'

  const totalMinutes = Math.max(1, Math.round(seconds / 60))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours === 0) return `${minutes} min`
  if (minutes === 0) return `${hours} h`
  return `${hours} h ${minutes} min`
}
