import { describe, expect, it } from 'vitest'
import { comporSobre, lerCor, razaoDeContraste } from './contraste'

describe('lerCor', () => {
  it('lê hexadecimal de 6 dígitos', () => {
    expect(lerCor('#004eac')).toEqual({ r: 0, g: 78, b: 172, a: 1 })
  })
  it('lê rgb com barra de opacidade (sintaxe do CSS moderno)', () => {
    expect(lerCor('rgb(1 205 255 / 0.16)')).toEqual({ r: 1, g: 205, b: 255, a: 0.16 })
  })
  it('lê rgba com vírgulas', () => {
    expect(lerCor('rgba(255, 255, 255, 0.5)')).toEqual({ r: 255, g: 255, b: 255, a: 0.5 })
  })
  it('recusa o que não é cor, em vez de devolver preto em silêncio', () => {
    expect(() => lerCor('var(--x)')).toThrow()
  })
})

describe('razaoDeContraste', () => {
  it('preto sobre branco é 21:1', () => {
    expect(razaoDeContraste('#000000', '#ffffff')).toBeCloseTo(21, 1)
  })
  it('é simétrica', () => {
    expect(razaoDeContraste('#004eac', '#ffffff')).toBeCloseTo(razaoDeContraste('#ffffff', '#004eac'), 5)
  })
})

describe('comporSobre', () => {
  it('cor opaca não muda', () => {
    expect(comporSobre('#004eac', '#ffffff')).toBe('#004eac')
  })
  it('50% de branco sobre preto dá cinza médio', () => {
    expect(comporSobre('rgb(255 255 255 / 0.5)', '#000000')).toBe('#808080')
  })
})
