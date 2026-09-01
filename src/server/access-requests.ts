'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { assertRole } from '@/lib/auth/guards'
import { getCurrentUser } from '@/lib/auth/session'
import { decisaoSolicitacaoEmail, novaSolicitacaoEmail, sendEmail } from '@/lib/email'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createServerSupabase } from '@/lib/supabase/server'
import {
  paraPendingRequest,
  SELECT_FILA_SOLICITACOES,
  SELECT_SOLICITACAO_DECISAO,
  type LinhaFilaSolicitacoes,
  type LinhaSolicitacaoDecisao,
  type PendingRequest,
} from './access-requests-query'
import { ok, toActionError, type ActionResult } from './result'
import { getCourseView } from './viewer'

// Um arquivo 'use server' só pode exportar funções async — por isso os
// SELECTs, os tipos de linha crua e o mapeamento moram em
// access-requests-query.ts (ver comentário lá). Aqui só o tipo (apagado em
// tempo de compilação, não conta como export de runtime) é reexportado, para
// quem importa `type PendingRequest` daqui continuar funcionando — é o caso
// de src/app/(admin)/admin/solicitacoes/request-row.tsx.
export type { PendingRequest }

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

/**
 * Estado do pedido de acesso pendente da pessoa logada para UM curso —
 * usado pela tela de curso trancado (`/curso/[slug]`) para decidir entre
 * mostrar o formulário de pedir acesso ou "seu pedido está em análise".
 *
 * Chamada só quando `course.access === 'none'`: getCourseView já garante
 * sessão ativa antes de devolver um curso não nulo (ver comentário em
 * src/server/viewer.ts), então o `null` de `getCurrentUser()` aqui não é um
 * caminho real — só o tipo exige a checagem.
 */
export async function getPendingRequestStatus(courseId: string): Promise<'pending' | 'none'> {
  const user = await getCurrentUser()
  if (!user) return 'none'

  const supabase = await createServerSupabase()
  const { data: pendente, error } = await supabase
    .from('access_requests')
    .select('id')
    .eq('user_id', user.id)
    .eq('course_id', courseId)
    .eq('status', 'pending')
    .maybeSingle()
  // Descartar este erro faria a tela mostrar o formulário para quem já tem
  // um pedido em aberto — a pessoa só descobriria ao enviar de novo e bater
  // no 23505 do índice único.
  if (error) throw error

  return pendente ? 'pending' : 'none'
}

export async function listAccessRequests(): Promise<PendingRequest[]> {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin' || user.status !== 'active') return []

  // Cliente da SESSÃO: solicitacoes_leitura (admin lê todas) sustenta esta
  // consulta. `error` não é descartado — um SELECT que falhasse (embed
  // ambíguo, RLS regredida etc.) devolveria `data: null`, e mostrar "nenhuma
  // solicitação pendente" nesse caso seria indistinguível de a fila estar
  // vazia de verdade.
  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('access_requests')
    .select(SELECT_FILA_SOLICITACOES)
    .eq('status', 'pending')
    .order('created_at')
  if (error) throw error

  return ((data ?? []) as unknown as LinhaFilaSolicitacoes[]).map(paraPendingRequest)
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

    // Chave de serviço só para montar o CONTEXTO da decisão (mesmo padrão de
    // moderar() em src/server/forum.ts): um membro comum não tem política
    // que leia o perfil/e-mail de outra pessoa, e essa leitura não é, em si,
    // a escrita que concede acesso.
    const admin = createAdminSupabase()
    const { data, error: leituraError } = await admin
      .from('access_requests')
      .select(SELECT_SOLICITACAO_DECISAO)
      .eq('id', parsed.data.id)
      .maybeSingle()
    if (leituraError) throw leituraError
    const solicitacao = data as unknown as LinhaSolicitacaoDecisao | null

    if (!solicitacao) return { ok: false, error: 'Solicitação não encontrada.' }
    // Checagem otimista: dá a mensagem certa no caso comum sem gastar uma
    // escrita à toa. Quem fecha a corrida de verdade — dois admins decidindo
    // a mesma solicitação ao mesmo tempo — é a UPDATE condicional abaixo, não
    // esta leitura. Mesmo padrão de moderar() em src/server/forum.ts: escreve
    // e confere as linhas afetadas, em vez de confiar só na checagem anterior.
    if (solicitacao.status !== 'pending') return { ok: false, error: 'Esta solicitação já foi decidida.' }

    // A UPDATE e o INSERT em course_access — as duas escritas que de fato
    // concedem acesso — rodam pelo cliente da SESSÃO, não pela chave de
    // serviço: solicitacoes_decide e liberacoes_escrita (0003_politicas_rls.sql)
    // já permitem as duas a um admin ativo, então o cliente da sessão faz o
    // banco sustentar esta escrita de verdade, não só a checagem em JS acima
    // (assertRole). Uma negativa de RLS numa UPDATE chega como zero linhas,
    // não como erro — por isso a UPDATE abaixo confere `decidida?.length`,
    // não só `error`.
    const supabase = await createServerSupabase()
    const { data: decidida, error } = await supabase
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
      // Zero linhas aqui tem DUAS causas possíveis, não uma: (a) perdeu a
      // corrida — outro admin decidiu entre a leitura acima e esta UPDATE —
      // ou (b) é uma RETENTATIVA de uma aprovação que já tinha marcado
      // status='approved' nesta própria UPDATE, numa chamada anterior, mas
      // cujo INSERT em course_access falhou depois por algum erro que não
      // '23505' (rede, timeout — qualquer coisa). Sem distinguir os dois
      // casos, (b) fica sem saída: a solicitação está 'approved' pra sempre
      // sem liberação nenhuma, e clicar em "Aprovar" de novo bate nesta
      // mensagem para sempre, porque a condição `.eq('status', 'pending')`
      // do UPDATE nunca mais casa.
      //
      // A tentação óbvia é inverter a ordem — conceder o acesso primeiro,
      // marcar a decisão depois — e ELA FOI CONSIDERADA E DESCARTADA: isso
      // reabriria a corrida que a UPDATE condicional acima fecha. Dois
      // admins decidindo a MESMA solicitação ao mesmo tempo (um aprova, um
      // nega) voltariam a poder produzir "negada com acesso concedido" — o
      // próprio bug que motivou fazer a UPDATE ser a escrita que arbitra a
      // corrida, não uma leitura prévia. A correção certa fica só na
      // retentativa: busca o estado ATUAL da linha (pode ter mudado desde a
      // leitura no topo desta função) e só segue adiante — para
      // course_access, que já é idempotente por causa do tratamento de
      // '23505' abaixo — se a linha já está 'approved' E a decisão pedida
      // AGORA também é 'approved'. Qualquer outra combinação (já 'denied',
      // ou pedindo 'denied' de novo) continua devolvendo o erro: nenhum
      // caminho novo aqui permite que um "negar" conceda acesso.
      const { data: atual, error: atualError } = await admin
        .from('access_requests')
        .select('status')
        .eq('id', parsed.data.id)
        .maybeSingle()
      if (atualError) throw atualError

      const retentativaDeAprovacaoJaMarcada = atual?.status === 'approved' && parsed.data.decisao === 'approved'
      if (!retentativaDeAprovacaoJaMarcada) return { ok: false, error: 'Esta solicitação já foi decidida.' }
      // Não retorna: cai no bloco abaixo, que concede o acesso (ou confirma
      // que já estava concedido) e segue o fluxo normal até o fim.
    }

    if (parsed.data.decisao === 'approved') {
      const { error: acessoError } = await supabase.from('course_access').insert({
        user_id: solicitacao.user_id,
        course_id: solicitacao.course_id,
        granted_by: decisor.id,
      })
      // Já existir a liberação não é erro: o resultado desejado está garantido.
      if (acessoError && acessoError.code !== '23505') throw acessoError
    }

    const solicitante = solicitacao.profiles
    const curso = solicitacao.courses

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
