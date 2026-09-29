/**
 * A aba que a sala de aula abre, lida da URL (`?aba=`). Mora fora do
 * componente de abas de propósito: aquele é client component, e o servidor
 * não pode chamar função exportada de um módulo 'use client'.
 */
export type AbaDaAula = 'sobre' | 'materiais' | 'duvidas'

const ABAS: readonly AbaDaAula[] = ['sobre', 'materiais', 'duvidas']

export function lerAba(valor: string | string[] | undefined): AbaDaAula {
  return typeof valor === 'string' && (ABAS as readonly string[]).includes(valor) ? (valor as AbaDaAula) : 'sobre'
}
