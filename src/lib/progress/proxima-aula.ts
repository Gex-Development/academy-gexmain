/**
 * A próxima aula de um curso: a primeira NÃO concluída, na ordem do curso.
 *
 * Única fonte para três lugares que precisam concordar (spec 2026-09-29,
 * seção 9.1): o botão do banner do curso, o selo "Assistindo" da lista de
 * episódios e o destaque da lista lateral da sala de aula. Também é ela que
 * getContinueWatching usa para escolher onde retomar.
 */
export type AcaoDoCurso =
  | { tipo: 'comecar'; indice: number }
  | { tipo: 'continuar'; indice: number }
  | { tipo: 'rever'; indice: 0 }
  | { tipo: 'nenhuma' }

export function acaoDoCurso(aulas: readonly { id: string }[], concluidas: ReadonlySet<string>): AcaoDoCurso {
  if (aulas.length === 0) return { tipo: 'nenhuma' }
  const indice = aulas.findIndex((a) => !concluidas.has(a.id))
  if (indice === -1) return { tipo: 'rever', indice: 0 }
  // Conta só as aulas DESTE curso: `concluidas` pode trazer ids de aula
  // despublicada ou de outro curso, que não são avanço aqui.
  const algumaConcluida = aulas.some((a) => concluidas.has(a.id))
  return algumaConcluida ? { tipo: 'continuar', indice } : { tipo: 'comecar', indice }
}

export type EstadoDaAula = 'concluida' | 'assistindo' | 'nao-iniciada'

export function estadoDasAulas(aulas: readonly { id: string }[], concluidas: ReadonlySet<string>): EstadoDaAula[] {
  const acao = acaoDoCurso(aulas, concluidas)
  const atual = acao.tipo === 'comecar' || acao.tipo === 'continuar' ? acao.indice : -1
  return aulas.map((a, i) => (concluidas.has(a.id) ? 'concluida' : i === atual ? 'assistindo' : 'nao-iniciada'))
}
