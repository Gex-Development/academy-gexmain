// Sem 'use server': lógica pura extraída para ficar importável por teste sem
// precisar de cookies() — mesmo motivo documentado em courses-query.ts,
// catalog-query.ts e viewer-query.ts. Antes desta extração, a MESMA decisão
// vivia duplicada, inline, em dois lugares (listAttachments, em
// attachments.ts, e o handler de GET /api/anexos/[id]) — nenhum dos dois
// testável diretamente (o primeiro por ser 'use server' com cookies(), o
// segundo por ser um Route Handler que também depende de cookies() via
// getCurrentUser()). Consolidada aqui, a regra tem um só dono e os dois
// chamadores passam a ser testáveis via a MESMA função.
import type { AccessLevel } from '@/lib/access'

/**
 * Decide se o MATERIAL de uma aula pode ser mostrado a quem já tem `nivel`
 * de acesso ao CURSO da aula.
 *
 * Acesso ao curso não basta: aula em rascunho (o líder publica aula por
 * aula, mesmo dentro de um curso já publicado) só libera material para quem
 * GERENCIA o curso — mesma regra que a política `anexos_leitura` já aplica
 * no banco (0005_endurece_politicas.sql). Esta função replica a decisão em
 * código de aplicação porque nem listAttachments nem a rota de download
 * confiam só em RLS: o Storage não tem política de leitura nenhuma (0001,
 * comentário) — o download é sempre por link assinado gerado no servidor, e
 * é ESTA checagem que decide se o link é gerado.
 */
export function podeVerAnexosDaAula(aulaStatus: string, nivel: AccessLevel): boolean {
  if (nivel === 'none') return false
  if (aulaStatus !== 'published' && nivel !== 'manage') return false
  return true
}
