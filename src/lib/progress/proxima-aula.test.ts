import { describe, expect, it } from 'vitest'
import { acaoDoCurso, estadoDasAulas } from './proxima-aula'

const aulas = [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }]

describe('acaoDoCurso', () => {
  it('curso sem aula não tem ação', () => {
    expect(acaoDoCurso([], new Set())).toEqual({ tipo: 'nenhuma' })
  })
  it('nada concluído → começar pela primeira', () => {
    expect(acaoDoCurso(aulas, new Set())).toEqual({ tipo: 'comecar', indice: 0 })
  })
  it('algumas concluídas → continuar pela primeira NÃO concluída', () => {
    expect(acaoDoCurso(aulas, new Set(['a1']))).toEqual({ tipo: 'continuar', indice: 1 })
  })
  it('concluiu fora de ordem → continuar pela primeira que falta, não pela seguinte à última', () => {
    expect(acaoDoCurso(aulas, new Set(['a2']))).toEqual({ tipo: 'continuar', indice: 0 })
  })
  it('todas concluídas → rever do começo', () => {
    expect(acaoDoCurso(aulas, new Set(['a1', 'a2', 'a3']))).toEqual({ tipo: 'rever', indice: 0 })
  })
  // Review Focus 4: progresso de aula que não é deste curso (despublicada, de
  // outro curso) não pode contar como avanço aqui.
  it('ids que não são do curso não contam como concluídos', () => {
    expect(acaoDoCurso(aulas, new Set(['x9', 'outra']))).toEqual({ tipo: 'comecar', indice: 0 })
  })
})

describe('estadoDasAulas', () => {
  it('marca concluídas, a próxima como assistindo e o resto como não iniciada', () => {
    expect(estadoDasAulas(aulas, new Set(['a1']))).toEqual(['concluida', 'assistindo', 'nao-iniciada'])
  })
  it('nada concluído → a primeira é a assistindo', () => {
    expect(estadoDasAulas(aulas, new Set())).toEqual(['assistindo', 'nao-iniciada', 'nao-iniciada'])
  })
  it('curso todo concluído → nenhuma assistindo', () => {
    expect(estadoDasAulas(aulas, new Set(['a1', 'a2', 'a3']))).toEqual(['concluida', 'concluida', 'concluida'])
  })
  it('curso sem aula → lista vazia', () => {
    expect(estadoDasAulas([], new Set())).toEqual([])
  })
})
