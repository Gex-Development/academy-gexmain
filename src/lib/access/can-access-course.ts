import type { AccessCourse, AccessLevel, AccessUser } from './types'

/**
 * Decide o nível de acesso de uma pessoa a um curso.
 *
 * Função pura de propósito: recebe tudo por parâmetro e não toca banco nem rede.
 * É a única fonte da regra de autorização da aplicação — a política RLS
 * `can_access_course` no Postgres espelha exatamente esta ordem.
 *
 * @param grantedCourseIds ids dos cursos liberados individualmente para este usuário
 *                         (linhas de `course_access`). Acesso pela área NÃO aparece aqui.
 */
export function canAccessCourse(
  user: AccessUser,
  course: AccessCourse,
  grantedCourseIds: ReadonlySet<string>,
): AccessLevel {
  // 1. Só quem está ativo acessa qualquer coisa — inclusive admin.
  if (user.status !== 'active') return 'none'

  // 2. Admin gerencia tudo, inclusive rascunhos.
  if (user.role === 'admin') return 'manage'

  // 3. Líder gerencia os cursos da sua própria área, inclusive rascunhos.
  //    A comparação exige área definida dos dois lados: a trilha inicial tem
  //    area_id nulo e não pertence a líder nenhum.
  if (user.role === 'leader' && user.areaId !== null && user.areaId === course.areaId) {
    return 'manage'
  }

  // 4. Daqui para baixo, rascunho é invisível.
  if (course.status !== 'published') return 'none'

  // 5. Trilha inicial: todo colaborador ativo assiste.
  if (course.isOnboarding) return 'view'

  // 6. Conteúdo do próprio setor. Ambos os lados precisam ter área definida.
  if (user.areaId !== null && user.areaId === course.areaId) return 'view'

  // 7. Liberação individual concedida pelo admin.
  if (grantedCourseIds.has(course.id)) return 'view'

  // 8. Bloqueado: a capa aparece na vitrine, o conteúdo não.
  return 'none'
}
