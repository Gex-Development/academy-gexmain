import { NextResponse, type NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { ATTACHMENT_BUCKET } from '@/lib/storage/attachments'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createServerSupabase } from '@/lib/supabase/server'
import { decideAttachmentDownload } from './attachment-access'

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
  const supabase = await createServerSupabase()
  const { data: liberacoes } = await supabase
    .from('course_access')
    .select('course_id')
    .eq('user_id', user.id)
  const liberados = new Set((liberacoes ?? []).map((l) => l.course_id))

  const decisao = await decideAttachmentDownload(admin, liberados, user, id)
  if (!decisao.ok) return NextResponse.json({ erro: decisao.erro }, { status: decisao.status })

  const { data: assinado, error } = await admin.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(decisao.storagePath, 60)

  if (error || !assinado) {
    return NextResponse.json({ erro: 'Não foi possível gerar o download.' }, { status: 500 })
  }

  return NextResponse.redirect(assinado.signedUrl)
}
