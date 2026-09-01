const MAPA: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/**
 * Escapa texto de usuário antes de entrar no HTML do e-mail.
 * Sem isso, um nome ou uma pergunta com marcação quebraria o layout do e-mail —
 * e, em clientes de e-mail permissivos, executaria conteúdo de terceiros.
 */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => MAPA[ch])
}
