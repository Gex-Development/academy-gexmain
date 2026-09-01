export type Role = 'admin' | 'leader' | 'member'
export type UserStatus = 'invited' | 'active' | 'inactive'
export type CourseStatus = 'draft' | 'published'

/**
 * 'none'   — não pode ver o conteúdo (vídeo, anexos, fórum)
 * 'view'   — pode consumir o conteúdo
 * 'manage' — pode consumir e editar o curso e suas aulas
 */
export type AccessLevel = 'none' | 'view' | 'manage'

export type AccessUser = {
  id: string
  role: Role
  status: UserStatus
  areaId: string | null
}

export type AccessCourse = {
  id: string
  areaId: string | null
  status: CourseStatus
  isOnboarding: boolean
}
