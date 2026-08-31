import { describe, expect, it } from 'vitest'
import { assertRole, ForbiddenError, UnauthenticatedError } from './guards'
import type { CurrentUser } from './session'

function currentUser(over: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: 'u1',
    role: 'member',
    status: 'active',
    areaId: 'area-1',
    fullName: 'Colaborador',
    email: 'colaborador@gexcorp.com.br',
    avatarUrl: null,
    ...over,
  }
}

describe('assertRole', () => {
  it('lança UnauthenticatedError quando não há usuário', () => {
    expect(() => assertRole(null, ['member'])).toThrow(UnauthenticatedError)
  })

  it('devolve o usuário quando o papel está na lista', () => {
    const user = currentUser({ role: 'leader' })
    expect(assertRole(user, ['leader', 'admin'])).toBe(user)
  })

  it('lança ForbiddenError quando o papel não está na lista', () => {
    expect(() => assertRole(currentUser(), ['admin'])).toThrow(ForbiddenError)
  })

  it('lança ForbiddenError para usuário desativado mesmo com o papel certo', () => {
    const user = currentUser({ role: 'admin', status: 'inactive' })
    expect(() => assertRole(user, ['admin'])).toThrow(ForbiddenError)
  })

  it('lança ForbiddenError para usuário ainda não confirmado', () => {
    const user = currentUser({ role: 'admin', status: 'invited' })
    expect(() => assertRole(user, ['admin'])).toThrow(ForbiddenError)
  })
})
