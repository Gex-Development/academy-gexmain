import { escapeHtml } from './escape'

export type EmailContent = { subject: string; html: string }

function layout(titulo: string, corpo: string, url: string, rotuloBotao: string): string {
  return `
<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#14181f">
  <p style="font-size:14px;font-weight:600;color:#1d4fd8;margin:0 0 16px">GEX Academy</p>
  <h1 style="font-size:18px;margin:0 0 12px">${titulo}</h1>
  ${corpo}
  <p style="margin:24px 0 0">
    <a href="${url}" style="display:inline-block;background:#1d4fd8;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px">${rotuloBotao}</a>
  </p>
</div>`.trim()
}

function citacao(texto: string): string {
  return `<blockquote style="margin:0 0 12px;padding:12px 16px;background:#f6f7f9;border-left:3px solid #e3e6ea;font-size:14px;white-space:pre-line">${escapeHtml(texto)}</blockquote>`
}

export function novaDuvidaEmail(input: {
  alunoNome: string
  aulaTitulo: string
  cursoTitulo: string
  pergunta: string
  url: string
}): EmailContent {
  return {
    subject: `Nova dúvida de ${input.alunoNome} em "${input.aulaTitulo}"`,
    html: layout(
      `Nova dúvida em ${escapeHtml(input.aulaTitulo)}`,
      `<p style="font-size:14px;margin:0 0 12px">${escapeHtml(input.alunoNome)} perguntou no curso ${escapeHtml(input.cursoTitulo)}:</p>
       ${citacao(input.pergunta)}`,
      input.url,
      'Responder',
    ),
  }
}

export function respostaDuvidaEmail(input: {
  professorNome: string
  aulaTitulo: string
  resposta: string
  url: string
}): EmailContent {
  return {
    subject: `${input.professorNome} respondeu sua dúvida em "${input.aulaTitulo}"`,
    html: layout(
      'Sua dúvida foi respondida',
      `<p style="font-size:14px;margin:0 0 12px">${escapeHtml(input.professorNome)} respondeu na aula ${escapeHtml(input.aulaTitulo)}:</p>
       ${citacao(input.resposta)}`,
      input.url,
      'Ver a resposta',
    ),
  }
}

export function novaSolicitacaoEmail(input: {
  solicitanteNome: string
  cursoTitulo: string
  mensagem: string | null
  url: string
}): EmailContent {
  return {
    subject: `${input.solicitanteNome} pediu acesso a "${input.cursoTitulo}"`,
    html: layout(
      'Nova solicitação de acesso',
      `<p style="font-size:14px;margin:0 0 12px">${escapeHtml(input.solicitanteNome)} pediu acesso ao curso ${escapeHtml(input.cursoTitulo)}.</p>
       ${input.mensagem ? citacao(input.mensagem) : ''}`,
      input.url,
      'Decidir',
    ),
  }
}

export function decisaoSolicitacaoEmail(input: {
  cursoTitulo: string
  aprovado: boolean
  url: string
}): EmailContent {
  if (input.aprovado) {
    return {
      subject: `Seu acesso a "${input.cursoTitulo}" foi liberado`,
      html: layout(
        'Acesso liberado',
        `<p style="font-size:14px;margin:0 0 12px">Você já pode assistir ao curso ${escapeHtml(input.cursoTitulo)}.</p>`,
        input.url,
        'Começar agora',
      ),
    }
  }

  return {
    subject: `Sobre seu pedido de acesso a "${input.cursoTitulo}"`,
    html: layout(
      'Pedido de acesso',
      `<p style="font-size:14px;margin:0 0 12px">Seu acesso ao curso ${escapeHtml(input.cursoTitulo)} não foi liberado neste momento. Fale com seu gestor se ainda precisar dele.</p>`,
      input.url,
      'Ver a plataforma',
    ),
  }
}
