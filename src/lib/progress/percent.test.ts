import { describe, expect, it } from 'vitest'
import { progressPercent } from './percent'

describe('progressPercent', () => {
  it('devolve 0 quando o curso não tem aulas', () => {
    expect(progressPercent(0, 0)).toBe(0)
  })

  it('devolve 0 quando nada foi concluído', () => {
    expect(progressPercent(0, 8)).toBe(0)
  })

  it('devolve 100 quando tudo foi concluído', () => {
    expect(progressPercent(8, 8)).toBe(100)
  })

  it('arredonda para o inteiro mais próximo', () => {
    expect(progressPercent(1, 3)).toBe(33)
    expect(progressPercent(2, 3)).toBe(67)
  })

  it('nunca passa de 100, mesmo com aula concluída que saiu do curso', () => {
    expect(progressPercent(9, 8)).toBe(100)
  })

  it('nunca fica negativo', () => {
    expect(progressPercent(-1, 8)).toBe(0)
  })
})
