// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { AbasDaAula } from './abas-da-aula'

afterEach(cleanup)

const abas = [
  { id: 'sobre' as const, rotulo: 'Sobre', conteudo: <p>descrição</p> },
  { id: 'materiais' as const, rotulo: 'Materiais · 2', conteudo: <p>anexos</p> },
  { id: 'duvidas' as const, rotulo: 'Dúvidas · 1', conteudo: <p>fórum</p> },
]

describe('AbasDaAula', () => {
  it('abre na aba inicial e esconde as outras', () => {
    render(<AbasDaAula abas={abas} inicial="duvidas" />)
    expect(screen.getByRole('tab', { name: 'Dúvidas · 1' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('fórum')).toBeVisible()
    expect(screen.getByText('descrição')).not.toBeVisible()
  })

  it('clicar troca a aba', async () => {
    render(<AbasDaAula abas={abas} inicial="sobre" />)
    await userEvent.click(screen.getByRole('tab', { name: 'Materiais · 2' }))
    expect(screen.getByText('anexos')).toBeVisible()
    expect(screen.getByText('descrição')).not.toBeVisible()
  })

  it('setas do teclado andam entre as abas, e o foco vai junto', async () => {
    render(<AbasDaAula abas={abas} inicial="sobre" />)
    screen.getByRole('tab', { name: 'Sobre' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Materiais · 2' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'Materiais · 2' })).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Dúvidas · 1' })).toHaveFocus()
  })

  it('só a aba ativa fica na ordem do Tab', () => {
    render(<AbasDaAula abas={abas} inicial="sobre" />)
    expect(screen.getByRole('tab', { name: 'Sobre' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('tab', { name: 'Materiais · 2' })).toHaveAttribute('tabindex', '-1')
  })
})
