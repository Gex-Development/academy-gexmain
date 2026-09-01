import { describe, expect, it } from 'vitest'
import { excedeuLimite, JANELA_MINUTOS, LIMITE_PUBLICACOES } from './rate-limit'

const AGORA = new Date('2026-08-31T12:00:00-03:00')

function minutosAtras(minutos: number): Date {
  return new Date(AGORA.getTime() - minutos * 60_000)
}

describe('excedeuLimite', () => {
  it('libera quem nunca publicou', () => {
    expect(excedeuLimite([], AGORA)).toBe(false)
  })

  it('libera abaixo do limite', () => {
    const recentes = Array.from({ length: LIMITE_PUBLICACOES - 1 }, () => minutosAtras(1))
    expect(excedeuLimite(recentes, AGORA)).toBe(false)
  })

  it('bloqueia ao atingir o limite dentro da janela', () => {
    const recentes = Array.from({ length: LIMITE_PUBLICACOES }, () => minutosAtras(1))
    expect(excedeuLimite(recentes, AGORA)).toBe(true)
  })

  it('ignora publicações fora da janela', () => {
    const antigas = Array.from({ length: LIMITE_PUBLICACOES }, () => minutosAtras(JANELA_MINUTOS + 1))
    expect(excedeuLimite(antigas, AGORA)).toBe(false)
  })

  it('conta apenas as que estão dentro da janela', () => {
    const mistura = [
      ...Array.from({ length: LIMITE_PUBLICACOES - 1 }, () => minutosAtras(1)),
      ...Array.from({ length: 5 }, () => minutosAtras(JANELA_MINUTOS + 2)),
    ]
    expect(excedeuLimite(mistura, AGORA)).toBe(false)
  })

  it('trata a borda exata da janela como fora', () => {
    const naBorda = Array.from({ length: LIMITE_PUBLICACOES }, () => minutosAtras(JANELA_MINUTOS))
    expect(excedeuLimite(naBorda, AGORA)).toBe(false)
  })
})
