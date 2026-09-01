// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { navLinksForRole } from './nav-links'

describe('navLinksForRole', () => {
  it('colaborador vê apenas início e perfil', () => {
    const hrefs = navLinksForRole('member').map((l) => l.href)
    expect(hrefs).toEqual(['/', '/perfil'])
  })

  it('líder ganha gerenciar, a fila de dúvidas e o painel de progresso', () => {
    const hrefs = navLinksForRole('leader').map((l) => l.href)
    expect(hrefs).toEqual(['/', '/gerenciar', '/gerenciar/duvidas', '/gerenciar/progresso', '/perfil'])
  })

  it('líder recebe /gerenciar/progresso, não /admin/progresso — o painel é dele também', () => {
    // A rota do painel fica sob (manage), não (admin): o layout de (admin)
    // redireciona quem não é admin, então um link para /admin/progresso
    // levaria o líder a lugar nenhum. Esta asserção prova que a correção de
    // rota pegou.
    const hrefs = navLinksForRole('leader').map((l) => l.href)
    expect(hrefs).toContain('/gerenciar/progresso')
    expect(hrefs).not.toContain('/admin/progresso')
  })

  it('admin ganha as telas administrativas', () => {
    const hrefs = navLinksForRole('admin').map((l) => l.href)
    expect(hrefs).toEqual([
      '/',
      '/gerenciar',
      '/gerenciar/duvidas',
      '/gerenciar/progresso',
      '/admin/pessoas',
      '/admin/areas',
      '/admin/solicitacoes',
      '/perfil',
    ])
  })

  it('nenhum link administrativo escapa para colaborador', () => {
    const hrefs = navLinksForRole('member').map((l) => l.href)
    expect(hrefs.some((h) => h.startsWith('/admin'))).toBe(false)
    expect(hrefs.some((h) => h.startsWith('/gerenciar'))).toBe(false)
  })
})
