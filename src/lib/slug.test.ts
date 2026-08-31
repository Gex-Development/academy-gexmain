import { describe, expect, it } from 'vitest'
import { slugify } from './slug'

describe('slugify', () => {
  it('remove acentos e normaliza para minúsculas', () => {
    expect(slugify('Gestão de Tráfego')).toBe('gestao-de-trafego')
  })

  it('troca espaços e símbolos por hífen único', () => {
    expect(slugify('Copy  &  Criação!!')).toBe('copy-criacao')
  })

  it('remove hífens das pontas', () => {
    expect(slugify('  -- Design --  ')).toBe('design')
  })

  it('preserva números', () => {
    expect(slugify('Meta Ads 2026')).toBe('meta-ads-2026')
  })

  it('devolve string vazia quando não sobra caractere válido', () => {
    expect(slugify('!!!')).toBe('')
  })

  it('trata o ç corretamente', () => {
    expect(slugify('Infraestrutura & Segurança')).toBe('infraestrutura-seguranca')
  })
})
