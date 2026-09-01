import { describe, expect, it } from 'vitest'
import { formatDuration } from './format'

describe('formatDuration', () => {
  it('devolve traço quando a duração não foi informada', () => {
    expect(formatDuration(null)).toBe('—')
  })

  it('formata menos de um minuto como minutos arredondados para 1', () => {
    expect(formatDuration(45)).toBe('1 min')
  })

  it('formata minutos exatos', () => {
    expect(formatDuration(600)).toBe('10 min')
  })

  it('formata horas e minutos', () => {
    expect(formatDuration(3900)).toBe('1 h 5 min')
  })

  it('omite os minutos quando a duração é uma hora cheia', () => {
    expect(formatDuration(7200)).toBe('2 h')
  })

  it('trata duração negativa como não informada', () => {
    expect(formatDuration(-10)).toBe('—')
  })
})
