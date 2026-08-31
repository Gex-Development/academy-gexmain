import { describe, expect, it } from 'vitest'
import { ehRotaPublica } from './public-routes'

describe('ehRotaPublica', () => {
  it.each(['/login', '/convite', '/recuperar-senha', '/nova-senha', '/auth'])(
    'reconhece %s como pública (match exato)',
    (rota) => {
      expect(ehRotaPublica(rota)).toBe(true)
    },
  )

  it.each(['/auth/confirm', '/convite/aceitar'])('reconhece %s como pública (subcaminho)', (rota) => {
    expect(ehRotaPublica(rota)).toBe(true)
  })

  it.each(['/authors', '/login-history', '/auth-log', '/convites'])(
    'NÃO reconhece %s como pública (quase-igual, sem fronteira de caminho)',
    (rota) => {
      expect(ehRotaPublica(rota)).toBe(false)
    },
  )

  it.each(['/', '/admin/pessoas', '/curso/algum-curso'])(
    'NÃO reconhece %s como pública (rota protegida)',
    (rota) => {
      expect(ehRotaPublica(rota)).toBe(false)
    },
  )

  it('NÃO reconhece a string vazia como pública', () => {
    expect(ehRotaPublica('')).toBe(false)
  })

  it('NÃO reconhece um caminho que só compartilha o sufixo como pública', () => {
    expect(ehRotaPublica('/painel/login')).toBe(false)
  })
})
