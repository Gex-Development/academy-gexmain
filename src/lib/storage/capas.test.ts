import { describe, expect, it } from 'vitest'
import { buildCapaPath, MAX_CAPA_BYTES, validateCapa } from './capas'

const png = { name: 'capa.png', type: 'image/png', size: 1024 }

describe('validateCapa', () => {
  it('aceita um PNG dentro do limite', () => {
    expect(validateCapa(png)).toBeNull()
  })

  it('aceita JPEG e WebP', () => {
    expect(validateCapa({ name: 'capa.jpg', type: 'image/jpeg', size: 2048 })).toBeNull()
    expect(validateCapa({ name: 'capa.webp', type: 'image/webp', size: 2048 })).toBeNull()
  })

  it('recusa arquivo vazio', () => {
    expect(validateCapa({ ...png, size: 0 })).toBe('O arquivo está vazio.')
  })

  it('recusa acima de 5 MB', () => {
    const erro = validateCapa({ ...png, size: MAX_CAPA_BYTES + 1 })
    expect(erro).toBe('A imagem passa de 5 MB.')
  })

  it('aceita exatamente 5 MB', () => {
    expect(validateCapa({ ...png, size: MAX_CAPA_BYTES })).toBeNull()
  })

  it('recusa SVG, que aceita script embutido', () => {
    expect(validateCapa({ name: 'logo.svg', type: 'image/svg+xml', size: 100 })).toBe(
      'Tipo de arquivo não permitido. Use PNG, JPEG ou WebP.',
    )
  })

  it('recusa tipo não permitido', () => {
    const erro = validateCapa({ name: 'video.mp4', type: 'video/mp4', size: 100 })
    expect(erro).toBe('Tipo de arquivo não permitido. Use PNG, JPEG ou WebP.')
  })
})

describe('buildCapaPath', () => {
  const areaId = '11111111-2222-3333-4444-555555555555'

  it('coloca o arquivo dentro da pasta do escopo/id', () => {
    expect(buildCapaPath('area', areaId, 'capa.png')).toMatch(new RegExp(`^area/${areaId}/`))
  })

  it('usa o escopo certo para curso', () => {
    expect(buildCapaPath('curso', areaId, 'capa.png')).toMatch(new RegExp(`^curso/${areaId}/`))
  })

  it('preserva a extensão', () => {
    expect(buildCapaPath('area', areaId, 'Banner Área.png')).toMatch(/\.png$/)
  })

  it('normaliza o nome, removendo acento e espaço', () => {
    const caminho = buildCapaPath('area', areaId, 'Capa da Área Financeira.jpg')
    expect(caminho).toContain('capa-da-area-financeira')
    expect(caminho).not.toContain(' ')
  })

  it('neutraliza tentativa de sair da pasta', () => {
    const caminho = buildCapaPath('area', areaId, '../../etc/passwd')
    expect(caminho.startsWith(`area/${areaId}/`)).toBe(true)
    expect(caminho).not.toContain('..')
  })

  it('lida com nome sem extensão', () => {
    const caminho = buildCapaPath('area', areaId, 'semextensao')
    expect(caminho.startsWith(`area/${areaId}/`)).toBe(true)
    expect(caminho).toContain('semextensao')
    expect(caminho).not.toContain('..')
  })

  it('gera caminhos diferentes para o mesmo nome', () => {
    const a = buildCapaPath('area', areaId, 'capa.png')
    const b = buildCapaPath('area', areaId, 'capa.png')
    expect(a).not.toBe(b)
  })
})
