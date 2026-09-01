export type Tema = 'dark' | 'light'

/** Chave única no localStorage. Usada pelo script do <head> e pelo botão. */
export const CHAVE_TEMA = 'gex-tema'

/** Escuro é o padrão da plataforma; só um valor exato e conhecido tira dele. */
export function temaInicial(armazenado: string | null): Tema {
  return armazenado === 'light' ? 'light' : 'dark'
}
