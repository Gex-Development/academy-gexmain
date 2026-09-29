/**
 * Contraste WCAG 2.x, com composição de transparência.
 *
 * A pele nova usa superfícies translúcidas (vidro, selecionado). Medir texto
 * contra a cor translúcida crua daria um número falso — o que o olho vê é a
 * cor COMPOSTA sobre o fundo de baixo. Por isso `comporSobre` existe, e o
 * teste de tokens compõe antes de medir.
 */
export type Cor = { r: number; g: number; b: number; a: number }

export function lerCor(texto: string): Cor {
  const t = texto.trim().toLowerCase()
  const hex = t.match(/^#([0-9a-f]{6})$/)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 }
  }
  const fn = t.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[/,]\s*([\d.]+))?\s*\)$/)
  if (fn) {
    return { r: Number(fn[1]), g: Number(fn[2]), b: Number(fn[3]), a: fn[4] === undefined ? 1 : Number(fn[4]) }
  }
  throw new Error(`Cor não reconhecida: ${texto}`)
}

function paraHex({ r, g, b }: Cor): string {
  return '#' + [r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')
}

export function comporSobre(frente: string, fundo: string): string {
  const f = lerCor(frente)
  const b = lerCor(fundo)
  return paraHex({
    r: f.r * f.a + b.r * (1 - f.a),
    g: f.g * f.a + b.g * (1 - f.a),
    b: f.b * f.a + b.b * (1 - f.a),
    a: 1,
  })
}

function linear(canal: number): number {
  const c = canal / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function luminancia(cor: string): number {
  const { r, g, b } = lerCor(cor)
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

export function razaoDeContraste(a: string, b: string): number {
  const la = luminancia(a)
  const lb = luminancia(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}
