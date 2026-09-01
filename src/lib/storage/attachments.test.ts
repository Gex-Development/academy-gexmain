import { describe, expect, it } from 'vitest'
import {
  buildAttachmentPath,
  MAX_ATTACHMENT_BYTES,
  validateAttachment,
} from './attachments'

const pdf = { name: 'manual.pdf', type: 'application/pdf', size: 1024 }

describe('validateAttachment', () => {
  it('aceita um PDF dentro do limite', () => {
    expect(validateAttachment(pdf)).toBeNull()
  })

  it('aceita planilha, apresentação e imagem', () => {
    expect(
      validateAttachment({
        name: 'metas.xlsx',
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: 2048,
      }),
    ).toBeNull()
    expect(
      validateAttachment({
        name: 'deck.pptx',
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        size: 2048,
      }),
    ).toBeNull()
    expect(validateAttachment({ name: 'print.png', type: 'image/png', size: 2048 })).toBeNull()
  })

  it('recusa arquivo vazio', () => {
    expect(validateAttachment({ ...pdf, size: 0 })).toBe('O arquivo está vazio.')
  })

  it('recusa acima de 50 MB', () => {
    const erro = validateAttachment({ ...pdf, size: MAX_ATTACHMENT_BYTES + 1 })
    expect(erro).toBe('O arquivo passa de 50 MB.')
  })

  it('aceita exatamente 50 MB', () => {
    expect(validateAttachment({ ...pdf, size: MAX_ATTACHMENT_BYTES })).toBeNull()
  })

  it('recusa executável', () => {
    const erro = validateAttachment({ name: 'virus.exe', type: 'application/x-msdownload', size: 100 })
    expect(erro).toBe('Tipo de arquivo não permitido.')
  })

  it('recusa HTML, que poderia rodar script se aberto', () => {
    expect(validateAttachment({ name: 'x.html', type: 'text/html', size: 100 })).toBe(
      'Tipo de arquivo não permitido.',
    )
  })

  it('recusa SVG, que aceita script embutido', () => {
    expect(validateAttachment({ name: 'logo.svg', type: 'image/svg+xml', size: 100 })).toBe(
      'Tipo de arquivo não permitido.',
    )
  })
})

describe('buildAttachmentPath', () => {
  const lessonId = '11111111-2222-3333-4444-555555555555'

  it('coloca o arquivo dentro da pasta da aula', () => {
    expect(buildAttachmentPath(lessonId, 'manual.pdf')).toMatch(new RegExp(`^${lessonId}/`))
  })

  it('preserva a extensão', () => {
    expect(buildAttachmentPath(lessonId, 'Plano de Mídia.pdf')).toMatch(/\.pdf$/)
  })

  it('normaliza o nome, removendo acento e espaço', () => {
    const caminho = buildAttachmentPath(lessonId, 'Relatório de Métricas.xlsx')
    expect(caminho).toContain('relatorio-de-metricas')
    expect(caminho).not.toContain(' ')
  })

  it('neutraliza tentativa de sair da pasta', () => {
    const caminho = buildAttachmentPath(lessonId, '../../etc/passwd.txt')
    expect(caminho.startsWith(`${lessonId}/`)).toBe(true)
    expect(caminho).not.toContain('..')
  })

  it('gera caminhos diferentes para o mesmo nome', () => {
    const a = buildAttachmentPath(lessonId, 'manual.pdf')
    const b = buildAttachmentPath(lessonId, 'manual.pdf')
    expect(a).not.toBe(b)
  })
})
