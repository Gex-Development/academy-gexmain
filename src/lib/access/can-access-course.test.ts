import { describe, expect, it } from 'vitest'
import { canAccessCourse } from './can-access-course'
import type { AccessCourse, AccessUser } from './types'

const AREA_TRAFEGO = 'area-trafego'
const AREA_DESIGN = 'area-design'

function user(over: Partial<AccessUser> = {}): AccessUser {
  return { id: 'u1', role: 'member', status: 'active', areaId: AREA_TRAFEGO, ...over }
}

function course(over: Partial<AccessCourse> = {}): AccessCourse {
  return { id: 'c1', areaId: AREA_TRAFEGO, status: 'published', isOnboarding: false, ...over }
}

const semLiberacao = new Set<string>()
const comLiberacao = new Set<string>(['c1'])

describe('canAccessCourse — usuário inativo ou não confirmado', () => {
  it('bloqueia colaborador desativado no curso da própria área', () => {
    expect(canAccessCourse(user({ status: 'inactive' }), course(), semLiberacao)).toBe('none')
  })

  it('bloqueia colaborador ainda não confirmado', () => {
    expect(canAccessCourse(user({ status: 'invited' }), course(), semLiberacao)).toBe('none')
  })

  it('bloqueia admin desativado — status vem antes de papel', () => {
    expect(canAccessCourse(user({ role: 'admin', status: 'inactive' }), course(), semLiberacao)).toBe('none')
  })

  it('bloqueia líder desativado na própria área', () => {
    expect(canAccessCourse(user({ role: 'leader', status: 'inactive' }), course(), semLiberacao)).toBe('none')
  })

  it('ignora liberação individual de usuário desativado', () => {
    expect(canAccessCourse(user({ status: 'inactive' }), course(), comLiberacao)).toBe('none')
  })
})

describe('canAccessCourse — admin', () => {
  it('gerencia qualquer curso publicado', () => {
    expect(canAccessCourse(user({ role: 'admin', areaId: null }), course(), semLiberacao)).toBe('manage')
  })

  it('gerencia curso em rascunho', () => {
    expect(canAccessCourse(user({ role: 'admin' }), course({ status: 'draft' }), semLiberacao)).toBe('manage')
  })

  it('gerencia curso de área que não é a dele', () => {
    expect(canAccessCourse(user({ role: 'admin', areaId: AREA_DESIGN }), course(), semLiberacao)).toBe('manage')
  })
})

describe('canAccessCourse — líder', () => {
  it('gerencia curso publicado da sua área', () => {
    expect(canAccessCourse(user({ role: 'leader' }), course(), semLiberacao)).toBe('manage')
  })

  it('gerencia rascunho da sua área', () => {
    expect(canAccessCourse(user({ role: 'leader' }), course({ status: 'draft' }), semLiberacao)).toBe('manage')
  })

  it('não gerencia curso de outra área — cai na regra de colaborador comum', () => {
    const level = canAccessCourse(user({ role: 'leader' }), course({ areaId: AREA_DESIGN }), semLiberacao)
    expect(level).toBe('none')
  })

  it('vê curso de outra área quando tem liberação individual', () => {
    const level = canAccessCourse(user({ role: 'leader' }), course({ areaId: AREA_DESIGN }), comLiberacao)
    expect(level).toBe('view')
  })

  it('não gerencia a trilha inicial, apenas assiste', () => {
    const level = canAccessCourse(user({ role: 'leader' }), course({ areaId: null, isOnboarding: true }), semLiberacao)
    expect(level).toBe('view')
  })

  it('não gerencia rascunho de outra área nem com liberação individual', () => {
    const level = canAccessCourse(
      user({ role: 'leader' }),
      course({ areaId: AREA_DESIGN, status: 'draft' }),
      comLiberacao,
    )
    expect(level).toBe('none')
  })
})

describe('canAccessCourse — colaborador', () => {
  it('vê curso publicado da sua área', () => {
    expect(canAccessCourse(user(), course(), semLiberacao)).toBe('view')
  })

  it('não vê curso publicado de outra área', () => {
    expect(canAccessCourse(user(), course({ areaId: AREA_DESIGN }), semLiberacao)).toBe('none')
  })

  it('vê curso de outra área com liberação individual', () => {
    expect(canAccessCourse(user(), course({ areaId: AREA_DESIGN }), comLiberacao)).toBe('view')
  })

  it('vê a trilha inicial mesmo sem área definida', () => {
    const level = canAccessCourse(
      user({ areaId: null }),
      course({ areaId: null, isOnboarding: true }),
      semLiberacao,
    )
    expect(level).toBe('view')
  })

  it('não vê a trilha inicial enquanto ela estiver em rascunho', () => {
    const level = canAccessCourse(
      user(),
      course({ areaId: null, isOnboarding: true, status: 'draft' }),
      semLiberacao,
    )
    expect(level).toBe('none')
  })

  it('não vê rascunho da própria área', () => {
    expect(canAccessCourse(user(), course({ status: 'draft' }), semLiberacao)).toBe('none')
  })

  it('não vê rascunho nem com liberação individual', () => {
    expect(canAccessCourse(user(), course({ status: 'draft' }), comLiberacao)).toBe('none')
  })

  it('sem área definida, não vê curso de área alguma', () => {
    expect(canAccessCourse(user({ areaId: null }), course(), semLiberacao)).toBe('none')
  })

  it('não confunde área nula do usuário com área nula do curso', () => {
    const level = canAccessCourse(
      user({ areaId: null }),
      course({ areaId: null, isOnboarding: false }),
      semLiberacao,
    )
    expect(level).toBe('none')
  })
})
