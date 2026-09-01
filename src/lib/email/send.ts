import 'server-only'
import { Resend } from 'resend'

/**
 * Envia um e-mail transacional.
 *
 * NUNCA lança: se o Resend estiver fora do ar ou a chave ausente, registra no
 * log e devolve normalmente. Perder um aviso é ruim; perder a pergunta que o
 * aluno acabou de escrever é inaceitável.
 */
export async function sendEmail(input: {
  to: string | string[]
  subject: string
  html: string
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM

  if (!apiKey || !from) {
    console.warn('[email] RESEND_API_KEY ou EMAIL_FROM ausente; e-mail não enviado:', input.subject)
    return
  }

  const destinatarios = Array.isArray(input.to) ? input.to : [input.to]
  if (destinatarios.length === 0) return

  try {
    const resend = new Resend(apiKey)
    const { error } = await resend.emails.send({
      from,
      to: destinatarios,
      subject: input.subject,
      html: input.html,
    })
    if (error) console.error('[email] falha no envio:', error)
  } catch (error) {
    console.error('[email] exceção no envio:', error)
  }
}
