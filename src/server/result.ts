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

    // GX001 é o SQLSTATE próprio do projeto — não o P0001 padrão do PL/pgSQL,
    // que é o que quase todo RAISE EXCEPTION recebe quando ninguém escolhe um
    // código à mão. Só uma exceção marcada com "using errcode = 'GX001'" chega
    // até aqui: é a convenção que separa uma mensagem escrita para a tela (sem
    // nome de tabela, de coluna ou conteúdo de linha) de um erro de banco
    // qualquer, que pode conter exatamente esse tipo de detalhe e por isso
    // nunca deve vazar para o usuário.
    if ('code' in error && (error as { code?: unknown }).code === 'GX001') {
      return fail(error.message)
    }
  }
  console.error('[action]', error)
  return fail('Não foi possível concluir a ação. Tente novamente.')
}
