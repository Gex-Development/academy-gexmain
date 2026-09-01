export const ROTAS_PUBLICAS = ['/login', '/convite', '/recuperar-senha', '/nova-senha', '/auth']

/**
 * Uma rota é pública quando é exatamente uma das rotas listadas, ou um caminho
 * abaixo dela. Comparar por prefixo solto tornaria `/authors` pública só porque
 * começa com `/auth` — e a falha seria silenciosa.
 */
export function ehRotaPublica(pathname: string): boolean {
  return ROTAS_PUBLICAS.some((rota) => pathname === rota || pathname.startsWith(`${rota}/`))
}
