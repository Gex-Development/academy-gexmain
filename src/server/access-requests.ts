'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { assertRole } from '@/lib/auth/guards'
import { getCurrentUser } from '@/lib/auth/session'
import { decisaoSolicitacaoEmail, novaSolicitacaoEmail, sendEmail } from '@/lib/email'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createServerSupabase } from '@/lib/supabase/server'
import { ok, toActionError, type ActionResult } from './result'
import { getCourseView } from './viewer'

export type PendingRequest = {
  id: string
  createdAt: string
  message: string | null
  personName: string
  personEmail: string
  areaName: string | null
  courseId: string
  courseTitle: string
}

export async function requestAccess(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const user = await getCurrentUser()
    if (!user || user.status !== 'active') return { ok: false, error: 'Faça login para continuar.' }

    const parsed = z
      .object({
        courseSlug: z.string().min(1),
        message: z.string().trim().max(500).optional().or(z.literal('')),
      })
      .safeParse(Object.fromEntries(formData))
    if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }

    const course = await getCourseView(parsed.data.courseSlug)
    if (!course) return { ok: false, error: 'Curso não encontrado.' }
    if (course.access !== 'none') return { ok: false, error: 'Você já tem acesso a este curso.' }

    const supabase = await createServerSupabase()
    const { error } = await supabase.from('access_requests').insert({
      user_id: user.id,
      course_id: course.id,
      message: parsed.data.message || null,
      status: 'pending',
    })

    if (error) {
      // O índice único garante uma pendência por pessoa e curso.
      if (error.code === '23505') {
        return { ok: false, error: 'Você já pediu acesso a este curso. Aguarde a resposta.' }
      }
      throw error
    }

    // Avisa todos os admins ativos.
    const admin = createAdminSupabase()
    const { data: admins } = await admin
      .from('profiles')
      .select('email')
      .eq('role', 'admin')
      .eq('status', 'active')

    const destinatarios = (admins ?? []).map((a) => a.email)
    if (destinatarios.length > 0) {
      const conteudo = novaSolicitacaoEmail({
        solicitanteNome: user.fullName,
        cursoTitulo: course.title,
        mensagem: parsed.data.message || null,
        url: `${process.env.NEXT_PUBLIC_SITE_URL}/admin/solicitacoes`,
      })
      await sendEmail({ to: destinatarios, ...conteudo })
    }

    revalidatePath(`/curso/${parsed.data.courseSlug}`)
    revalidatePath('/')
    revalidatePath('/admin/solicitacoes')
    return ok(null)
  } catch (error) {
    return toActionError(error)
  }
}

export async function listAccessRequests(): Promise<PendingRequest[]> {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin' || user.status !== 'active') return []

  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('access_requests')
    .select('id, created_at, message, course_id, profiles(full_name, email, areas(name)), courses(title)')
    .eq('status', 'pending')
    .order('created_at')

  type Linha = {
    id: string
    created_at: string
    message: string | null
    course_id: string
    profiles: { full_name: string; email: string; areas: { name: string } | null } | null
    courses: { title: string } | null
  }

  return ((data ?? []) as unknown as Linha[]).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    message: row.message,
    personName: row.profiles?.full_name ?? 'Colaborador',
    personEmail: row.profiles?.email ?? '',
    areaName: row.profiles?.areas?.name ?? null,
    courseId: row.course_id,
    courseTitle: row.courses?.title ?? 'Curso',
  }))
}

export async function decideAccessRequest(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const decisor = assertRole(await getCurrentUser(), ['admin'])

    const parsed = z
      .object({ id: z.string().uuid(), decisao: z.enum(['approved', 'denied']) })
      .safeParse(Object.fromEntries(formData))
    if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }

    const admin = createAdminSupabase()
    const { data: solicitacao } = await admin
      .from('access_requests')
      .select('id, user_id, course_id, status, profiles(email), courses(title, slug)')
      .eq('id', parsed.data.id)
      .maybeSingle()

    if (!solicitacao) return { ok: false, error: 'Solicitação não encontrada.' }
    // Checagem otimista: dá a mensagem certa no caso comum sem gastar uma
    // escrita à toa. Quem fecha a corrida de verdade — dois admins decidindo
    // a mesma solicitação ao mesmo tempo — é a UPDATE condicional abaixo, não
    // esta leitura. Mesmo padrão de moderar() em src/server/forum.ts: escreve
    // e confere as linhas afetadas, em vez de confiar só na checagem anterior.
    if (solicitacao.status !== 'pending') return { ok: false, error: 'Esta solicitação já foi decidida.' }

    const { data: decidida, error } = await admin
      .from('access_requests')
      .update({
        status: parsed.data.decisao,
        decided_by: decisor.id,
        decided_at: new Date().toISOString(),
      })
      .eq('id', parsed.data.id)
      .eq('status', 'pending')
      .select('id')
    if (error) throw error
    if ((decidida?.length ?? 0) === 0) {
      // Perdeu a corrida: outro admin decidiu entre a leitura acima e esta
      // UPDATE. Não segue para course_access nem para o e-mail — quem
      // decidiu de fato já disparou os dois.
      return { ok: false, error: 'Esta solicitação já foi decidida.' }
    }

    if (parsed.data.decisao === 'approved') {
      const { error: acessoError } = await admin.from('course_access').insert({
        user_id: solicitacao.user_id,
        course_id: solicitacao.course_id,
        granted_by: decisor.id,
      })
      // Já existir a liberação não é erro: o resultado desejado está garantido.
      if (acessoError && acessoError.code !== '23505') throw acessoError
    }

    const solicitante = solicitacao.profiles as unknown as { email: string } | null
    const curso = solicitacao.courses as unknown as { title: string; slug: string } | null

    if (solicitante?.email && curso) {
      const conteudo = decisaoSolicitacaoEmail({
        cursoTitulo: curso.title,
        aprovado: parsed.data.decisao === 'approved',
        url: `${process.env.NEXT_PUBLIC_SITE_URL}/curso/${curso.slug}`,
      })
      await sendEmail({ to: solicitante.email, ...conteudo })
    }

    revalidatePath('/admin/solicitacoes')
    revalidatePath('/')
    // Quem foi aprovado abre o link do e-mail e cai direto em /curso/[slug] —
    // sem isto a página continuaria em cache mostrando o cadeado. Não pode
    // depender do solicitante ter e-mail (bloco acima): `curso` vem da mesma
    // leitura, então fica disponível aqui de qualquer forma.
    if (curso) revalidatePath(`/curso/${curso.slug}`)
    return ok(null)
  } catch (error) {
    return toActionError(error)
  }
}
