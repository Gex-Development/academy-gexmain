import { slugify } from '@/lib/slug'

export const CAPA_BUCKET = 'capas'
export const MAX_CAPA_BYTES = 5 * 1024 * 1024

/** Área usa uma pasta por área; curso, uma pasta por curso. */
export type CapaEscopo = 'area' | 'curso'

/**
 * Tipos aceitos como capa.
 * SVG fica de fora de propósito, mesmo raciocínio que ALLOWED_ATTACHMENT_MIME
 * já documenta para HTML/SVG: SVG executa script se aberto no navegador, e o
 * arquivo é servido de um domínio nosso (bucket público, sem allowlist de
 * domínio como um <img src> externo teria).
 */
export const ALLOWED_CAPA_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

/** Devolve a mensagem de erro, ou null se a imagem pode ser enviada. */
export function validateCapa(file: { name: string; type: string; size: number }): string | null {
  if (file.size <= 0) return 'O arquivo está vazio.'
  if (file.size > MAX_CAPA_BYTES) return 'A imagem passa de 5 MB.'
  if (!ALLOWED_CAPA_MIME[file.type]) return 'Tipo de arquivo não permitido. Use PNG, JPEG ou WebP.'
  return null
}

/**
 * Monta o caminho no bucket. Segue buildAttachmentPath (src/lib/storage/
 * attachments.ts): o nome enviado pelo usuário nunca entra cru — é
 * normalizado por slugify e prefixado por escopo, id e um id aleatório, o
 * que elimina travessia de diretório e colisão de nomes.
 */
export function buildCapaPath(escopo: CapaEscopo, id: string, fileName: string): string {
  const ponto = fileName.lastIndexOf('.')
  const base = ponto > 0 ? fileName.slice(0, ponto) : fileName
  const extensao = ponto > 0 ? slugify(fileName.slice(ponto + 1)) : ''
  const nome = slugify(base) || 'capa'
  const unico = crypto.randomUUID()
  const prefixo = `${escopo}/${id}`
  return extensao ? `${prefixo}/${unico}-${nome}.${extensao}` : `${prefixo}/${unico}-${nome}`
}
