import { describe, expect, it } from 'vitest'
import { destinoInterno } from './page'

describe('destinoInterno', () => {
  it('aceita um caminho simples', () => {
    expect(destinoInterno('/admin/pessoas')).toBe('/admin/pessoas')
  })

  it('aceita um caminho com query string', () => {
    expect(destinoInterno('/admin/pessoas?pagina=2')).toBe('/admin/pessoas?pagina=2')
  })

  it('sem "redirect", cai em /', () => {
    expect(destinoInterno(undefined)).toBe('/')
  })

  // Mesma tabela de casos de src/app/auth/confirm/route.test.ts: cada um
  // destes passaria por um filtro baseado em prefixo (startsWith('/') &&
  // !startsWith('//')), mas o WHATWG URL parser (o mesmo algoritmo que
  // qualquer navegador usa para resolver o cabeçalho Location) resolve todos
  // eles para o host externo "evil.com".
  it.each([
    ['https://evil.com', 'URL absoluta'],
    ['//evil.com', 'protocol-relative: mesmo esquema, host externo'],
    ['/\\evil.com', 'barra invertida logo após a barra: WHATWG normaliza para //evil.com'],
    ['/\t/evil.com', 'tab entre as barras: WHATWG descarta caracteres de controle na normalização'],
  ])('rejeita %j (%s) e cai em /', (bruto) => {
    expect(destinoInterno(bruto)).toBe('/')
  })
})
