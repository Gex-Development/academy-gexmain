import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Resend } from 'resend'
import { sendEmail } from './send'

// 'server-only' lança de propósito fora de um bundler que entende a condição de
// export "react-server" — é assim que ele barra o uso em Client Components no
// Next.js. Fora do Next (aqui no Vitest) isso derrubaria a importação antes de
// qualquer teste rodar, então neutralizamos o marcador só neste arquivo de teste.
vi.mock('server-only', () => ({}))

const sendMock = vi.fn()
vi.mock('resend', () => ({
  // Precisa ser `function`, não arrow: `new Resend(...)` exige um construtor de
  // verdade, e uma arrow function nunca serve (TypeError: is not a constructor).
  Resend: vi.fn(function Resend() {
    return { emails: { send: sendMock } }
  }),
}))

const ResendMock = vi.mocked(Resend)

describe('sendEmail — nunca lança', () => {
  beforeEach(() => {
    sendMock.mockReset()
    ResendMock.mockClear()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('sem RESEND_API_KEY nem EMAIL_FROM — o estado real deste ambiente: resolve e não chama o Resend', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    vi.stubEnv('EMAIL_FROM', '')

    await expect(
      sendEmail({ to: 'aluno@empresa.com', subject: 'assunto', html: '<p>x</p>' }),
    ).resolves.toBeUndefined()

    expect(ResendMock).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalled()
  })

  it('com EMAIL_FROM configurado mas sem RESEND_API_KEY: resolve e não chama o Resend', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    vi.stubEnv('EMAIL_FROM', 'GEX Academy <academy@gexcorp.com.br>')

    await expect(
      sendEmail({ to: 'aluno@empresa.com', subject: 'assunto', html: '<p>x</p>' }),
    ).resolves.toBeUndefined()

    expect(ResendMock).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalled()
  })

  it('lista de destinatários vazia: resolve sem chamar o Resend', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_chave_de_teste')
    vi.stubEnv('EMAIL_FROM', 'GEX Academy <academy@gexcorp.com.br>')

    await expect(
      sendEmail({ to: [], subject: 'assunto', html: '<p>x</p>' }),
    ).resolves.toBeUndefined()

    expect(ResendMock).not.toHaveBeenCalled()
  })

  it('Resend devolve um objeto de erro em vez de lançar: resolve mesmo assim', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_chave_de_teste')
    vi.stubEnv('EMAIL_FROM', 'GEX Academy <academy@gexcorp.com.br>')
    sendMock.mockResolvedValue({ data: null, error: { name: 'validation_error', message: 'chave inválida' } })

    await expect(
      sendEmail({ to: 'aluno@empresa.com', subject: 'assunto', html: '<p>x</p>' }),
    ).resolves.toBeUndefined()

    expect(console.error).toHaveBeenCalled()
  })

  it('o cliente do Resend lança uma exceção (rede fora do ar): resolve mesmo assim', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_chave_de_teste')
    vi.stubEnv('EMAIL_FROM', 'GEX Academy <academy@gexcorp.com.br>')
    sendMock.mockRejectedValue(new Error('timeout de rede'))

    await expect(
      sendEmail({ to: 'aluno@empresa.com', subject: 'assunto', html: '<p>x</p>' }),
    ).resolves.toBeUndefined()

    expect(console.error).toHaveBeenCalled()
  })

  it('com configuração válida, envia para o(s) destinatário(s) sempre como lista', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_chave_de_teste')
    vi.stubEnv('EMAIL_FROM', 'GEX Academy <academy@gexcorp.com.br>')
    sendMock.mockResolvedValue({ data: { id: '1' }, error: null })

    await sendEmail({ to: 'aluno@empresa.com', subject: 'assunto', html: '<p>x</p>' })

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'GEX Academy <academy@gexcorp.com.br>',
        to: ['aluno@empresa.com'],
        subject: 'assunto',
        html: '<p>x</p>',
      }),
    )
  })
})
