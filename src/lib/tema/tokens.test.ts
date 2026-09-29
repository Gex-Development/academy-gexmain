import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { comporSobre, razaoDeContraste } from './contraste'

const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')

function bloco(abertura: string): string {
  const inicio = css.indexOf(abertura)
  if (inicio === -1) throw new Error(`bloco ${abertura} não encontrado`)
  return css.slice(inicio, css.indexOf('\n}', inicio))
}

function tokens(trecho: string): Record<string, string> {
  const saida: Record<string, string> = {}
  for (const m of trecho.matchAll(/--color-([a-z0-9-]+):\s*([^;]+);/g)) saida[m[1]] = m[2].trim()
  return saida
}

const claro = tokens(bloco('@theme {'))
const escuro = { ...claro, ...tokens(bloco(':root.dark {')) }

// No escuro o fundo da página é um degradê; o ponto MAIS CLARO dele
// (#0e2a55, topo) é o pior caso para texto claro por cima. Superfícies
// translúcidas são compostas sobre esse ponto antes de medir.
const PIOR_FUNDO_ESCURO = '#0e2a55'

type Par = [rotulo: string, texto: string, fundo: string]

function pares(t: Record<string, string>, base: string): Par[] {
  return [
    ['texto sobre fundo', t['texto'], t['fundo']],
    ['texto-suave sobre fundo', t['texto-suave'], t['fundo']],
    ['texto sobre superfície', t['texto'], t['superficie']],
    ['texto-suave sobre superfície', t['texto-suave'], t['superficie']],
    ['texto sobre vidro', t['texto'], comporSobre(t['vidro'], base)],
    ['texto-suave sobre vidro', t['texto-suave'], comporSobre(t['vidro'], base)],
    ['selecionado-texto sobre selecionado', t['selecionado-texto'], comporSobre(t['selecionado'], base)],
    ['acao-texto sobre acao', t['acao-texto'], t['acao']],
    // O selo "Concluída" e as mensagens de sucesso. No claro, o #1f8a4c de
    // antes dava 4,38:1 sobre branco — abaixo do mínimo, e já em uso.
    ['sucesso sobre superfície', t['sucesso'], t['superficie']],
  ]
}

describe.each([
  ['claro', claro, claro['fundo']],
  ['escuro', escuro, PIOR_FUNDO_ESCURO],
])('tokens do tema %s passam 4,5:1', (_nome, t, base) => {
  it.each(pares(t, base))('%s', (_rotulo, texto, fundo) => {
    expect(texto, 'token ausente').toBeDefined()
    expect(razaoDeContraste(texto, fundo)).toBeGreaterThanOrEqual(4.5)
  })
})
