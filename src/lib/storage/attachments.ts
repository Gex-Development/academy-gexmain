import { slugify } from '@/lib/slug'

export const ATTACHMENT_BUCKET = 'lesson-attachments'
export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024

/**
 * Tipos aceitos como material de apoio.
 * HTML e SVG ficam de fora de propósito: os dois executam script se abertos
 * no navegador, e o download vem de um domínio nosso.
 */
export const ALLOWED_ATTACHMENT_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/csv': 'csv',
  'text/plain': 'txt',
  'application/zip': 'zip',
  'image/png': 'png',
  'image/jpeg': 'jpg',
}

/** Devolve a mensagem de erro, ou null se o arquivo pode ser enviado. */
export function validateAttachment(file: { name: string; type: string; size: number }): string | null {
  if (file.size <= 0) return 'O arquivo está vazio.'
  if (file.size > MAX_ATTACHMENT_BYTES) return 'O arquivo passa de 50 MB.'
  if (!ALLOWED_ATTACHMENT_MIME[file.type]) return 'Tipo de arquivo não permitido.'
  return null
}

/**
 * Monta o caminho no bucket. O nome enviado pelo usuário nunca entra cru:
 * é normalizado e prefixado pelo id da aula e por um id aleatório, o que
 * elimina travessia de diretório e colisão de nomes.
 */
export function buildAttachmentPath(lessonId: string, fileName: string): string {
  const ponto = fileName.lastIndexOf('.')
  const base = ponto > 0 ? fileName.slice(0, ponto) : fileName
  const extensao = ponto > 0 ? slugify(fileName.slice(ponto + 1)) : ''
  const nome = slugify(base) || 'arquivo'
  const unico = crypto.randomUUID()
  return extensao ? `${lessonId}/${unico}-${nome}.${extensao}` : `${lessonId}/${unico}-${nome}`
}
