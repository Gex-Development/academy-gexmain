import type { Role } from '@/lib/access'
import type { CurrentUser } from './session'

export class UnauthenticatedError extends Error {
  constructor() {
    super('Sessão não encontrada.')
    this.name = 'UnauthenticatedError'
  }
}

export class ForbiddenError extends Error {
  constructor() {
    super('Você não tem permissão para esta ação.')
    this.name = 'ForbiddenError'
  }
}

/**
 * Confirma que existe um usuário ativo com um dos papéis informados.
 * Função pura para poder ser testada sem sessão nem banco.
 */
export function assertRole(user: CurrentUser | null, roles: Role[]): CurrentUser {
  if (!user) throw new UnauthenticatedError()
  if (user.status !== 'active') throw new ForbiddenError()
  if (!roles.includes(user.role)) throw new ForbiddenError()
  return user
}
