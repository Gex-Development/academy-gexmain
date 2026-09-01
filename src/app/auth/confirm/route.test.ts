import { describe, expect, it } from 'vitest'
import { destinoSeguro } from './route'

describe('destinoSeguro', () => {
  it('aceita os dois destinos permitidos', () => {
    expect(destinoSeguro('/convite', 'invite')).toBe('/convite')
    expect(destinoSeguro('/nova-senha', 'recovery')).toBe('/nova-senha')
  })

  it('sem "next", cai em /convite para convite e /nova-senha para recuperação', () => {
    expect(destinoSeguro(null, 'invite')).toBe('/convite')
    expect(destinoSeguro(null, 'recovery')).toBe('/nova-senha')
  })

  // Cada um destes passaria por um filtro baseado em prefixo (startsWith('/')
  // && !startsWith('//')) — é exatamente esse filtro que a rota usava antes
  // desta correção, e o WHATWG URL parser (o mesmo algoritmo que qualquer
  // navegador usa para resolver o cabeçalho Location) resolve todos eles para
  // o host externo "evil.com". A lista branca rejeita todos porque nenhum é
  // "/convite" nem "/nova-senha", exatamente — sem precisar entender por que
  // cada um é perigoso.
  it.each([
    ['//evil.com', 'protocol-relative: mesmo esquema, host externo'],
    ['https://evil.com', 'URL absoluta'],
    ['/\\evil.com', 'barra invertida logo após a barra: WHATWG normaliza para //evil.com'],
    ['/\\/evil.com', 'barra + barra invertida + barra: idem'],
    ['/\t/evil.com', 'tab entre as barras: WHATWG descarta caracteres de controle na normalização'],
    ['/convite/../../evil', 'path traversal a partir de um destino válido'],
    ['/convite?x=1', 'quase-igual a um destino válido, mas não é igual'],
  ])('rejeita %j (%s)', (bruto) => {
    expect(destinoSeguro(bruto, 'invite')).toBe('/convite')
    expect(destinoSeguro(bruto, 'recovery')).toBe('/nova-senha')
  })
})
