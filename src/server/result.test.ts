import { describe, expect, it } from 'vitest'
import { ForbiddenError, UnauthenticatedError } from '@/lib/auth/guards'
import { fail, ok, toActionError } from './result'

describe('ok / fail', () => {
  it('ok encapsula os dados com ok: true', () => {
    expect(ok({ id: '1' })).toEqual({ ok: true, data: { id: '1' } })
  })

  it('fail encapsula a mensagem com ok: false', () => {
    expect(fail('deu ruim')).toEqual({ ok: false, error: 'deu ruim' })
  })
})

describe('toActionError', () => {
  it('traduz UnauthenticatedError para pedir login', () => {
    expect(toActionError(new UnauthenticatedError())).toEqual({
      ok: false,
      error: 'Faça login para continuar.',
    })
  })

  it('traduz ForbiddenError para mensagem de permissão', () => {
    expect(toActionError(new ForbiddenError())).toEqual({
      ok: false,
      error: 'Você não tem permissão para esta ação.',
    })
  })

  // P0001 é o SQLSTATE de um RAISE EXCEPTION explícito no banco — como a
  // invariante "sempre precisa existir um admin ativo" (profiles_exige_admin).
  // Essa mensagem já foi escrita em português para quem usa a tela, então
  // precisa passar direto, e não virar o genérico "Não foi possível...".
  it('repassa a mensagem de um RAISE EXCEPTION do banco (código P0001)', () => {
    const erroDoBanco = Object.assign(
      new Error('A plataforma precisa de ao menos um administrador ativo.'),
      { name: 'PostgrestError', code: 'P0001' },
    )

    expect(toActionError(erroDoBanco)).toEqual({
      ok: false,
      error: 'A plataforma precisa de ao menos um administrador ativo.',
    })
  })

  it('não repassa a mensagem de um erro de banco comum (código diferente de P0001)', () => {
    const erroGenerico = Object.assign(new Error('relation "x" does not exist'), {
      name: 'PostgrestError',
      code: '42P01',
    })

    expect(toActionError(erroGenerico)).toEqual({
      ok: false,
      error: 'Não foi possível concluir a ação. Tente novamente.',
    })
  })

  it('erro desconhecido vira mensagem genérica, sem vazar detalhe interno', () => {
    expect(toActionError(new Error('detalhe interno sensível'))).toEqual({
      ok: false,
      error: 'Não foi possível concluir a ação. Tente novamente.',
    })
  })
})
