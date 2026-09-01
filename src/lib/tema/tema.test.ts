import { describe, expect, it } from 'vitest'
import { temaInicial } from './tema'

describe('temaInicial', () => {
  it('sem preferência salva, abre no escuro — é o padrão da plataforma', () => {
    expect(temaInicial(null)).toBe('dark')
  })

  it('respeita a escolha salva pela pessoa', () => {
    expect(temaInicial('light')).toBe('light')
    expect(temaInicial('dark')).toBe('dark')
  })

  it('valor corrompido no armazenamento cai no padrão, não quebra a tela', () => {
    // localStorage é do navegador da pessoa: extensão, versão antiga do site
    // ou digitação no console podem deixar qualquer coisa ali.
    expect(temaInicial('')).toBe('dark')
    expect(temaInicial('LIGHT')).toBe('dark')
    expect(temaInicial('{"tema":"light"}')).toBe('dark')
  })
})
