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

  // GX001 é o SQLSTATE próprio do projeto (using errcode = 'GX001'), usado só
  // em RAISE EXCEPTION escrito para chegar até a tela — como a invariante
  // "sempre precisa existir um admin ativo" (profiles_exige_admin). Essa
  // mensagem já foi escrita em português para quem usa a tela, então precisa
  // passar direto, e não virar o genérico "Não foi possível...".
  it('repassa a mensagem de um RAISE EXCEPTION marcado com o código do projeto (GX001)', () => {
    const erroDoBanco = Object.assign(
      new Error('A plataforma precisa de ao menos um administrador ativo.'),
      { name: 'PostgrestError', code: 'GX001' },
    )

    expect(toActionError(erroDoBanco)).toEqual({
      ok: false,
      error: 'A plataforma precisa de ao menos um administrador ativo.',
    })
  })

  // P0001 é o SQLSTATE padrão que o PL/pgSQL atribui a qualquer RAISE
  // EXCEPTION sem "using errcode" — ou seja, quase todo RAISE EXCEPTION que
  // alguém venha a escrever no futuro, inclusive um que exponha nome de
  // coluna ou conteúdo de linha sem querer. Este teste é a trava contra
  // alargar o passthrough de volta para P0001: se `toActionError` voltasse a
  // aceitar P0001, esta asserção falharia.
  it('NÃO repassa um RAISE EXCEPTION genérico (código P0001), mesmo com mensagem sensível', () => {
    const erroDoBanco = Object.assign(
      new Error('coluna "senha_hash" viola a restrição not-null'),
      { name: 'PostgrestError', code: 'P0001' },
    )

    expect(toActionError(erroDoBanco)).toEqual({
      ok: false,
      error: 'Não foi possível concluir a ação. Tente novamente.',
    })
  })

  it('não repassa a mensagem de um erro de banco comum (código de restrição/permissão)', () => {
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
