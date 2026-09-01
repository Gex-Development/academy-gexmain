export const LIMITE_PUBLICACOES = 10
export const JANELA_MINUTOS = 5

/**
 * Diz se a pessoa já publicou demais na janela recente.
 * Função pura recebendo "agora" por parâmetro para poder ser testada sem
 * mexer no relógio do processo.
 */
export function excedeuLimite(publicacoesRecentes: Date[], agora: Date): boolean {
  const inicioDaJanela = agora.getTime() - JANELA_MINUTOS * 60_000
  const dentroDaJanela = publicacoesRecentes.filter((data) => data.getTime() > inicioDaJanela)
  return dentroDaJanela.length >= LIMITE_PUBLICACOES
}
