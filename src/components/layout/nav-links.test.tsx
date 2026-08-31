// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { navLinksForRole } from './nav-links'

describe('navLinksForRole', () => {
  it('colaborador vê apenas início e perfil', () => {
    const hrefs = navLinksForRole('member').map((l) => l.href)
    expect(hrefs).toEqual(['/', '/perfil'])
  })

  it('líder ganha gerenciar e a fila de dúvidas', () => {
    const hrefs = navLinksForRole('leader').map((l) => l.href)
    expect(hrefs).toEqual(['/', '/gerenciar', '/gerenciar/duvidas', '/perfil'])
  })

  it('admin ganha as telas administrativas', () => {
    const hrefs = navLinksForRole('admin').map((l) => l.href)
    expect(hrefs).toEqual([
      '/',
      '/gerenciar',
      '/gerenciar/duvidas',
      '/admin/pessoas',
      '/admin/areas',
      '/admin/solicitacoes',
      '/admin/progresso',
      '/perfil',
    ])
  })

  it('nenhum link administrativo escapa para colaborador', () => {
    const hrefs = navLinksForRole('member').map((l) => l.href)
    expect(hrefs.some((h) => h.startsWith('/admin'))).toBe(false)
    expect(hrefs.some((h) => h.startsWith('/gerenciar'))).toBe(false)
  })
})
