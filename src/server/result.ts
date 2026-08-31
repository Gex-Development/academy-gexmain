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

    // P0001: RAISE EXCEPTION explícito num trigger do banco (ex.: a invariante
    // de "sempre precisa existir um admin ativo"). Essas mensagens são escritas
    // no banco em português, pensadas para quem usa a tela — diferente de um
    // erro de banco qualquer, não há detalhe interno para esconder aqui.
    if ('code' in error && (error as { code?: unknown }).code === 'P0001') {
      return fail(error.message)
    }
  }
  console.error('[action]', error)
  return fail('Não foi possível concluir a ação. Tente novamente.')
}
