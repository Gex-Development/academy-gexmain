import { describe, expect, it } from 'vitest'
import { escapeHtml } from './escape'
import {
  decisaoSolicitacaoEmail,
  novaDuvidaEmail,
  novaSolicitacaoEmail,
  respostaDuvidaEmail,
} from './templates'

describe('escapeHtml', () => {
  it('neutraliza as tags', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    )
  })

  it('neutraliza aspas e e comercial', () => {
    expect(escapeHtml(`Ana & "Bruno" 'Costa'`)).toBe(
      'Ana &amp; &quot;Bruno&quot; &#39;Costa&#39;',
    )
  })

  it('deixa texto comum intacto', () => {
    expect(escapeHtml('Como faço para escalar a campanha?')).toBe(
      'Como faço para escalar a campanha?',
    )
  })
})

describe('novaDuvidaEmail', () => {
  const base = {
    alunoNome: 'Ana Silva',
    aulaTitulo: 'Estrutura de campanha',
    cursoTitulo: 'Meta Ads',
    pergunta: 'Qual orçamento inicial vocês usam?',
    url: 'https://academy.gexcorp.com.br/curso/meta-ads/aula/estrutura',
  }

  it('põe o nome do aluno e a aula no assunto', () => {
    const email = novaDuvidaEmail(base)
    expect(email.subject).toBe('Nova dúvida de Ana Silva em "Estrutura de campanha"')
  })

  it('inclui a pergunta e o link no corpo', () => {
    const email = novaDuvidaEmail(base)
    expect(email.html).toContain('Qual orçamento inicial vocês usam?')
    expect(email.html).toContain(base.url)
  })

  it('escapa HTML vindo do nome e da pergunta', () => {
    const email = novaDuvidaEmail({
      ...base,
      alunoNome: '<img src=x onerror=alert(1)>',
      pergunta: '<script>roubar()</script>',
    })
    expect(email.html).not.toContain('<script>')
    expect(email.html).not.toContain('<img src=x onerror=alert(1)>')
    expect(email.html).toContain('&lt;script&gt;')
    // Nota (desvio do brief, ver task-2-report.md): a asserção original aqui era
    // `not.toContain('onerror=')`. Isso é inatingível por qualquer escapeHtml correto —
    // a palavra "onerror=" não contém nenhum dos 5 caracteres que escapeHtml('&<>"\'')
    // troca (ver describe('escapeHtml') acima), então ela sobrevive como texto inerte
    // dentro da tag neutralizada. O que importa para segurança é que `<` e `>` viraram
    // entidade — nenhum leitor de e-mail volta a interpretar isso como uma tag `<img>`
    // viva. Checamos isso diretamente: a tag bruta não aparece, e a versão escapada aparece.
    expect(email.html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })
})

describe('respostaDuvidaEmail', () => {
  const base = {
    professorNome: 'Carlos Líder',
    aulaTitulo: 'Estrutura de campanha',
    resposta: 'Começamos com R$ 50 por conjunto.',
    url: 'https://academy.gexcorp.com.br/curso/meta-ads/aula/estrutura',
  }

  it('anuncia quem respondeu no assunto', () => {
    expect(respostaDuvidaEmail(base).subject).toBe(
      'Carlos Líder respondeu sua dúvida em "Estrutura de campanha"',
    )
  })

  it('escapa a resposta', () => {
    const email = respostaDuvidaEmail({ ...base, resposta: '<b>negrito</b>' })
    expect(email.html).not.toContain('<b>negrito</b>')
    expect(email.html).toContain('&lt;b&gt;')
  })
})

describe('novaSolicitacaoEmail', () => {
  it('nomeia a pessoa e o curso', () => {
    const email = novaSolicitacaoEmail({
      solicitanteNome: 'Ana Silva',
      cursoTitulo: 'Meta Ads',
      mensagem: 'Vou assumir campanhas no mês que vem.',
      url: 'https://academy.gexcorp.com.br/admin/solicitacoes',
    })
    expect(email.subject).toBe('Ana Silva pediu acesso a "Meta Ads"')
    expect(email.html).toContain('Vou assumir campanhas no mês que vem.')
  })

  it('funciona sem mensagem', () => {
    const email = novaSolicitacaoEmail({
      solicitanteNome: 'Ana Silva',
      cursoTitulo: 'Meta Ads',
      mensagem: null,
      url: 'https://academy.gexcorp.com.br/admin/solicitacoes',
    })
    expect(email.html).toContain('Ana Silva')
    expect(email.html).not.toContain('null')
  })
})

describe('decisaoSolicitacaoEmail', () => {
  it('avisa a aprovação com link do curso', () => {
    const email = decisaoSolicitacaoEmail({
      cursoTitulo: 'Meta Ads',
      aprovado: true,
      url: 'https://academy.gexcorp.com.br/curso/meta-ads',
    })
    expect(email.subject).toBe('Seu acesso a "Meta Ads" foi liberado')
    expect(email.html).toContain('https://academy.gexcorp.com.br/curso/meta-ads')
  })

  it('avisa a recusa sem prometer link', () => {
    const email = decisaoSolicitacaoEmail({
      cursoTitulo: 'Meta Ads',
      aprovado: false,
      url: 'https://academy.gexcorp.com.br/curso/meta-ads',
    })
    expect(email.subject).toBe('Sobre seu pedido de acesso a "Meta Ads"')
    expect(email.html).toContain('não foi liberado')
  })
})
