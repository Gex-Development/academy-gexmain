// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { InputSenha } from './input-senha'

afterEach(cleanup)

describe('InputSenha', () => {
  it('começa oculta e o olho alterna entre mostrar e ocultar', async () => {
    render(
      <>
        <label htmlFor="senha">Senha</label>
        <InputSenha id="senha" name="senha" />
      </>,
    )
    const campo = screen.getByLabelText('Senha')
    expect(campo).toHaveAttribute('type', 'password')

    await userEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }))
    expect(campo).toHaveAttribute('type', 'text')

    await userEvent.click(screen.getByRole('button', { name: 'Ocultar senha' }))
    expect(campo).toHaveAttribute('type', 'password')
  })
})
