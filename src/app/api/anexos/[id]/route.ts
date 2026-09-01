import { NextResponse, type NextRequest } from 'next/server'
import { canAccessCourse } from '@/lib/access'
import { getCurrentUser } from '@/lib/auth/session'
import { ATTACHMENT_BUCKET } from '@/lib/storage/attachments'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * Entrega o anexo por link assinado de 60 segundos, e só depois de confirmar
 * o acesso ao curso. O bucket é privado: não existe URL pública para nenhum
 * arquivo, e um link copiado deixa de funcionar em um minuto.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 })

  const admin = createAdminSupabase()
  const { data: anexo } = await admin
    .from('lesson_attachments')
    .select('storage_path, lessons(course_id, status, courses(id, area_id, status, is_onboarding))')
    .eq('id', id)
    .maybeSingle()

  if (!anexo) return NextResponse.json({ erro: 'Anexo não encontrado.' }, { status: 404 })

  const aula = anexo.lessons as unknown as {
    status: string
    courses: { id: string; area_id: string | null; status: string; is_onboarding: boolean }
  }
  const curso = aula.courses

  const supabase = await createServerSupabase()
  const { data: liberacoes } = await supabase
    .from('course_access')
    .select('course_id')
    .eq('user_id', user.id)
  const liberados = new Set((liberacoes ?? []).map((l) => l.course_id))

  const nivel = canAccessCourse(
    user,
    {
      id: curso.id,
      areaId: curso.area_id,
      status: curso.status as 'draft' | 'published',
      isOnboarding: curso.is_onboarding,
    },
    liberados,
  )

  // Aula em rascunho só é baixável por quem gerencia o curso.
  if (nivel === 'none' || (aula.status !== 'published' && nivel !== 'manage')) {
    return NextResponse.json({ erro: 'Sem acesso a este material.' }, { status: 403 })
  }

  const { data: assinado, error } = await admin.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(anexo.storage_path, 60)

  if (error || !assinado) {
    return NextResponse.json({ erro: 'Não foi possível gerar o download.' }, { status: 500 })
  }

  return NextResponse.redirect(assinado.signedUrl)
}
