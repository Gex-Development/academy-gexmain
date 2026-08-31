export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

export function fail(error: string): ActionResult<never> {
  return { ok: false, error }
}

/**
 * Converte exceções conhecidas em mensagem para a tela.
 * Erro inesperado vira mensagem genérica e vai para o log — nunca vaza detalhe
 * de banco para o usuário.
 */
export function toActionError(error: unknown): ActionResult<never> {
  if (error instanceof Error) {
    if (error.name === 'UnauthenticatedError') return fail('Faça login para continuar.')
    if (error.name === 'ForbiddenError') return fail('Você não tem permissão para esta ação.')
  }
  console.error('[action]', error)
  return fail('Não foi possível concluir a ação. Tente novamente.')
}
