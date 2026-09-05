// Sem 'use server' e fora de src/server/ de propósito: este arquivo mora ao
// lado da rota que o usa (mesma pasta), mas segue a MESMA técnica de
// courses-query.ts/catalog-query.ts/viewer-query.ts/attachments-query.ts —
// lógica pura, sem cookies(), para um teste de banco poder chamar a MESMA
// função que a rota usa em produção, contra o Postgres de verdade, em vez de
// reimplementar a decisão em paralelo. GET /api/anexos/[id] é um Route
// Handler, não um módulo 'use server' — mas getCurrentUser() (via
// createServerSupabase → next/headers) tem a mesma limitação de cookies()
// fora de um request Next.js de verdade, então a extração é igualmente
// necessária para testar.
import type { SupabaseClient } from '@supabase/supabase-js'
import { canAccessCourse, type AccessUser } from '@/lib/access'
import { podeVerAnexosDaAula } from '@/server/attachments-query'
import type { Database } from '@/lib/supabase/database.types'

export type AttachmentDownloadDecision =
  | { ok: true; storagePath: string }
  | { ok: false; status: 404; erro: 'Anexo não encontrado.' }
  | { ok: false; status: 403; erro: 'Sem acesso a este material.' }

/**
 * Decide se `user` pode baixar o anexo `attachmentId`, e devolve o caminho
 * de Storage quando pode. Não gera o link assinado (isso continua na rota,
 * que precisa do cliente admin de qualquer forma) — só a DECISÃO de acesso,
 * a parte que antes só existia inline dentro do handler e nunca tinha teste.
 */
export async function decideAttachmentDownload(
  admin: SupabaseClient<Database>,
  liberados: ReadonlySet<string>,
  user: AccessUser,
  attachmentId: string,
  areasLiberadas: ReadonlySet<string> = new Set(),
): Promise<AttachmentDownloadDecision> {
  const { data: anexo } = await admin
    .from('lesson_attachments')
    .select('storage_path, lessons(course_id, status, courses(id, area_id, status, is_onboarding))')
    .eq('id', attachmentId)
    .maybeSingle()

  if (!anexo) return { ok: false, status: 404, erro: 'Anexo não encontrado.' }

  const aula = anexo.lessons as unknown as {
    status: string
    courses: { id: string; area_id: string | null; status: string; is_onboarding: boolean }
  }
  const curso = aula.courses

  const nivel = canAccessCourse(
    user,
    {
      id: curso.id,
      areaId: curso.area_id,
      status: curso.status as 'draft' | 'published',
      isOnboarding: curso.is_onboarding,
    },
    liberados,
    areasLiberadas,
  )

  if (!podeVerAnexosDaAula(aula.status, nivel)) {
    return { ok: false, status: 403, erro: 'Sem acesso a este material.' }
  }

  return { ok: true, storagePath: anexo.storage_path }
}
