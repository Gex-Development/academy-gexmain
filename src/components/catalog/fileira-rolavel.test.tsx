// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FileiraRolavel } from './fileira-rolavel'

afterEach(cleanup)

// jsdom não faz layout: scrollWidth/clientWidth/scrollLeft vêm zerados. Cada
// teste define a geometria da lista à mão e dispara 'scroll' para remedir.
function geometria(lista: HTMLElement, { largura, conteudo, posicao }: { largura: number; conteudo: number; posicao: number }) {
  Object.defineProperty(lista, 'clientWidth', { configurable: true, value: largura })
  Object.defineProperty(lista, 'scrollWidth', { configurable: true, value: conteudo })
  Object.defineProperty(lista, 'scrollLeft', { configurable: true, writable: true, value: posicao })
  act(() => {
    fireEvent.scroll(lista)
  })
}

function montar() {
  render(
    <FileiraRolavel tituloId="fileira-x" titulo="Copy" extra={<span>Ver tudo →</span>}>
      <li>card 1</li>
      <li>card 2</li>
    </FileiraRolavel>,
  )
  return screen.getByRole('list')
}

describe('FileiraRolavel', () => {
  it('sem transbordar, não mostra setas; o título e o extra continuam', () => {
    const lista = montar()
    geometria(lista, { largura: 1000, conteudo: 1000, posicao: 0 })
    expect(screen.getByRole('heading', { name: 'Copy' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Copy' })).toBeInTheDocument()
    expect(screen.getByText('Ver tudo →')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('no começo, só avançar liga; no fim, só voltar', () => {
    const lista = montar()
    geometria(lista, { largura: 1000, conteudo: 3000, posicao: 0 })
    expect(screen.getByRole('button', { name: 'Rolar Copy para a esquerda' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Rolar Copy para a direita' })).toBeEnabled()

    geometria(lista, { largura: 1000, conteudo: 3000, posicao: 2000 })
    expect(screen.getByRole('button', { name: 'Rolar Copy para a esquerda' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Rolar Copy para a direita' })).toBeDisabled()
  })

  it('clicar nas setas rola quase uma largura da lista para cada lado', async () => {
    const lista = montar()
    const scrollBy = vi.fn()
    lista.scrollBy = scrollBy as unknown as typeof lista.scrollBy
    geometria(lista, { largura: 1000, conteudo: 3000, posicao: 1000 })

    await userEvent.click(screen.getByRole('button', { name: 'Rolar Copy para a direita' }))
    expect(scrollBy).toHaveBeenLastCalledWith(expect.objectContaining({ left: 900 }))

    await userEvent.click(screen.getByRole('button', { name: 'Rolar Copy para a esquerda' }))
    expect(scrollBy).toHaveBeenLastCalledWith(expect.objectContaining({ left: -900 }))
  })

  it('as setas apontam para a lista que controlam', () => {
    const lista = montar()
    geometria(lista, { largura: 1000, conteudo: 3000, posicao: 0 })
    expect(lista).toHaveAttribute('id', 'fileira-x-lista')
    expect(screen.getByRole('button', { name: 'Rolar Copy para a direita' })).toHaveAttribute('aria-controls', 'fileira-x-lista')
  })
})
