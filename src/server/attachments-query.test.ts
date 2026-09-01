import { describe, expect, it } from 'vitest'
import { podeVerAnexosDaAula } from './attachments-query'

describe('podeVerAnexosDaAula', () => {
  it('sem acesso ao curso, nunca vê material — mesmo de aula publicada', () => {
    expect(podeVerAnexosDaAula('published', 'none')).toBe(false)
    expect(podeVerAnexosDaAula('draft', 'none')).toBe(false)
  })

  it('acesso de visualização vê material de aula publicada', () => {
    expect(podeVerAnexosDaAula('published', 'view')).toBe(true)
  })

  it('acesso de visualização NÃO vê material de aula em rascunho', () => {
    expect(podeVerAnexosDaAula('draft', 'view')).toBe(false)
  })

  it('quem gerencia o curso vê material de aula em rascunho e de aula publicada', () => {
    expect(podeVerAnexosDaAula('draft', 'manage')).toBe(true)
    expect(podeVerAnexosDaAula('published', 'manage')).toBe(true)
  })
})
