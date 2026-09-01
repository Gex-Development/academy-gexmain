import type { Role } from '@/lib/access'

export type NavLink = { href: string; label: string }

const INICIO: NavLink = { href: '/', label: 'Início' }
const PERFIL: NavLink = { href: '/perfil', label: 'Perfil' }

const GESTAO: NavLink[] = [
  { href: '/gerenciar', label: 'Gerenciar' },
  { href: '/gerenciar/duvidas', label: 'Dúvidas' },
  { href: '/gerenciar/progresso', label: 'Progresso' },
]

const ADMIN: NavLink[] = [
  { href: '/admin/pessoas', label: 'Pessoas' },
  { href: '/admin/areas', label: 'Áreas' },
  { href: '/admin/solicitacoes', label: 'Solicitações' },
]

/**
 * Links visíveis para cada papel.
 * Isto é navegação, não autorização: cada rota revalida a permissão no servidor.
 */
export function navLinksForRole(role: Role): NavLink[] {
  if (role === 'admin') return [INICIO, ...GESTAO, ...ADMIN, PERFIL]
  if (role === 'leader') return [INICIO, ...GESTAO, PERFIL]
  return [INICIO, PERFIL]
}
