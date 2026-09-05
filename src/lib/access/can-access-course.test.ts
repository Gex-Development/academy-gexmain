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

// ── Área extra liberada pelo admin (tabela area_access) ────────────────────
//
// Diferente de course_access, que libera UM curso: área extra libera todo
// curso publicado daquela área, inclusive os que ainda vão ser criados.
// A pessoa continua com uma área principal — isto é acréscimo, não troca.
const areaExtraDesign = new Set<string>([AREA_DESIGN])

describe('canAccessCourse — área extra', () => {
  it('libera curso publicado de área extra', () => {
    expect(
      canAccessCourse(user(), course({ areaId: AREA_DESIGN }), semLiberacao, areaExtraDesign),
    ).toBe('view')
  })

  it('NÃO libera rascunho — a regra 4 vem antes e rascunho só aparece para quem gerencia', () => {
    expect(
      canAccessCourse(
        user(),
        course({ areaId: AREA_DESIGN, status: 'draft' }),
        semLiberacao,
        areaExtraDesign,
      ),
    ).toBe('none')
  })

  it('NÃO libera curso de área que não foi concedida', () => {
    expect(
      canAccessCourse(user(), course({ areaId: 'area-outra' }), semLiberacao, areaExtraDesign),
    ).toBe('none')
  })

  it('nunca eleva a "manage" — área extra é só leitura', () => {
    expect(
      canAccessCourse(user(), course({ areaId: AREA_DESIGN }), semLiberacao, areaExtraDesign),
    ).not.toBe('manage')
  })

  it('não vale para usuário desativado — status continua vindo primeiro', () => {
    expect(
      canAccessCourse(
        user({ status: 'inactive' }),
        course({ areaId: AREA_DESIGN }),
        semLiberacao,
        areaExtraDesign,
      ),
    ).toBe('none')
  })

  it('curso sem área (a trilha inicial) não casa com área extra nenhuma', () => {
    // Guarda contra o bug clássico de comparar null com null: a trilha tem
    // area_id nulo, e um Set nunca deve ser consultado com null.
    expect(
      canAccessCourse(
        user({ areaId: null }),
        course({ areaId: null, isOnboarding: false, status: 'published' }),
        semLiberacao,
        new Set<string>(),
      ),
    ).toBe('none')
  })

  it('sem o argumento, o comportamento é o de antes — nenhuma área extra', () => {
    expect(canAccessCourse(user(), course({ areaId: AREA_DESIGN }), semLiberacao)).toBe('none')
  })
})
