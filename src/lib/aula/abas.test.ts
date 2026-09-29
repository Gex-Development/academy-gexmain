import { describe, expect, it } from 'vitest'
import { lerAba } from './abas'

describe('lerAba', () => {
  it('reconhece as três abas', () => {
    expect(lerAba('sobre')).toBe('sobre')
    expect(lerAba('materiais')).toBe('materiais')
    expect(lerAba('duvidas')).toBe('duvidas')
  })
  // Review Focus 2.
  it('ausente, desconhecida ou repetida → sobre', () => {
    expect(lerAba(undefined)).toBe('sobre')
    expect(lerAba('qualquer')).toBe('sobre')
    expect(lerAba(['duvidas', 'sobre'])).toBe('sobre')
  })
})
