// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ListaDeEpisodios } from './lista-de-episodios'

afterEach(cleanup)

const aulas = [
  { id: 'a1', slug: 'aula-1', title: 'Criando produto', coverUrl: 'https://exemplo.test/aula-1.png', durationSeconds: null },
  { id: 'a2', slug: 'aula-2', title: 'Compra teste', coverUrl: null, durationSeconds: null },
]

function miniaturas(container: HTMLElement) {
  return Array.from(container.querySelectorAll('img')).map((img) => img.getAttribute('src'))
}

describe('ListaDeEpisodios — miniatura', () => {
  it('usa a capa da aula; sem ela, a capa do curso', () => {
    const { container } = render(
      <ListaDeEpisodios courseSlug="c" aulas={aulas} estados={['nao-iniciada', 'nao-iniciada']} capaUrl="https://exemplo.test/curso.png" />,
    )
    expect(miniaturas(container)).toEqual(['https://exemplo.test/aula-1.png', 'https://exemplo.test/curso.png'])
    expect(screen.getByRole('link', { name: /Criando produto/ })).toHaveAttribute('href', '/curso/c/aula/aula-1')
  })

  it('sem capa da aula nem do curso, não há imagem (fica o degradê)', () => {
    const { container } = render(
      <ListaDeEpisodios courseSlug="c" aulas={[aulas[1]!]} estados={['nao-iniciada']} capaUrl={null} />,
    )
    expect(miniaturas(container)).toEqual([])
  })

  it('a lista compacta (sala de aula) não mostra miniatura', () => {
    const { container } = render(
      <ListaDeEpisodios courseSlug="c" aulas={aulas} estados={['nao-iniciada', 'nao-iniciada']} capaUrl="https://exemplo.test/curso.png" compacta />,
    )
    expect(miniaturas(container)).toEqual([])
  })
})
