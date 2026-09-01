'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth/session'
import { novaDuvidaEmail, respostaDuvidaEmail, sendEmail } from '@/lib/email'
import { excedeuLimite, JANELA_MINUTOS } from '@/lib/forum/rate-limit'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createServerSupabase } from '@/lib/supabase/server'
import {
  paraForumQuestion,
  paraPendingQuestion,
  pertenceAFilaDoLider,
  podeGerenciarArea,
  SELECT_FILA_DUVIDAS,
  SELECT_PERGUNTAS,
  type ForumAnswer,
  type ForumQuestion,
  type LinhaFilaDuvidas,
  type LinhaPergunta,
  type PendingQuestion,
  type PerfilAutor,
  type PerfisPorId,
} from './forum-query'
import { ok, toActionError, type ActionResult } from './result'
import { getLessonView } from './viewer'

// Um arquivo 'use server' só pode exportar funções async (Next.js recusa o
// build inteiro se algum export não for) — por isso os tipos, a consulta, o
// selo de professor e o mapeamento moram em forum-query.ts. Aqui só o tipo
// (apagado em tempo de compilação, não conta como export de runtime) é
// reexportado, para quem importa `type ForumQuestion`/`ForumAnswer` daqui
// continuar funcionando — é o caso dos componentes em src/components/forum.
export type { ForumAnswer, ForumQuestion, PendingQuestion }

/**
 * Contexto comum a toda action do fórum: confirma sessão ativa e acesso à
 * AULA especificamente (não só ao papel de quem chama) e decide se esta
 * pessoa modera este fórum.
 *
 * Cada export abaixo é um endpoint que qualquer sessão logada pode chamar
 * com qualquer lessonId/questionId — por isso a checagem sempre acontece
 * aqui, contra o recurso concreto pedido, nunca só "sou líder/admin".
 *
 * getLessonView já aplica a MESMA regra de acesso que a página da aula usa
 * (canAccessCourse, aula em rascunho só para quem gerencia, curso bloqueado
 * etc.) — se a pessoa não pode ver esta aula, também não pode ver nem postar
 * no fórum dela. podeGerenciarArea decide moderação separadamente: é a
 * mesma regra das ramificações 2 e 3 de canAccessCourse (admin sempre;
 * líder só na própria área), mas aplicada à ÁREA do curso — ver o
 * comentário em forum-query.ts sobre por que não reaproveita canAccessCourse
 * direto aqui.
 */
async function contextoDaAula(lessonId: string) {
  const user = await getCurrentUser()
  if (!user || user.status !== 'active') return null

  const admin = createAdminSupabase()
  const { data } = await admin
    .from('lessons')
    .select('id, title, slug, course_id, courses(slug, title, area_id)')
    .eq('id', lessonId)
    .maybeSingle()
  if (!data) return null

  const curso = data.courses as unknown as { slug: string; title: string; area_id: string | null }

  const view = await getLessonView(curso.slug, data.slug)
  if (!view) return null

  return {
    user,
    lessonId: data.id,
    lessonTitle: data.title,
    courseSlug: curso.slug,
    courseTitle: curso.title,
    lessonSlug: data.slug,
    areaId: curso.area_id,
    podeModerar: podeGerenciarArea(user, curso.area_id),
  }
}

type ContextoDaAula = NonNullable<Awaited<ReturnType<typeof contextoDaAula>>>

/** Publicações da pessoa dentro da janela do limite de abuso. */
async function publicacoesRecentes(userId: string): Promise<Date[]> {
  const admin = createAdminSupabase()
  const desde = new Date(Date.now() - JANELA_MINUTOS * 60_000).toISOString()

  const [perguntas, respostas] = await Promise.all([
    admin.from('questions').select('created_at').eq('author_id', userId).gte('created_at', desde),
    admin.from('answers').select('created_at').eq('author_id', userId).gte('created_at', desde),
  ])

  return [...(perguntas.data ?? []), ...(respostas.data ?? [])].map((r) => new Date(r.created_at))
}

const corpoSchema = z
  .string()
  .trim()
  .min(1, 'Escreva sua mensagem.')
  .max(4000, 'A mensagem passa de 4000 caracteres.')

/**
 * Perfis (nome, papel, área, status) dos autores de um conjunto de linhas,
 * por id — a segunda metade da leitura que listQuestions faz.
 *
 * `profiles` não tem política de leitura que libere um colega comum ver o
 * perfil de outra pessoa (0001_schema_inicial.sql: só o próprio, admin, ou
 * líder dentro da própria área) — é a primeira tela do produto que precisa
 * disso (nenhuma outra já exibia o nome de um terceiro pela sessão do
 * usuário comum). Por isso esta busca usa a chave de serviço, mas SÓ para
 * projetar (id, full_name, role, area_id, status) — nunca e-mail nem outra
 * coluna — e restrita aos ids que realmente apareceram na listagem que o
 * cliente da SESSÃO já trouxe (essa, sim, sob RLS). O conteúdo do fórum
 * continua sustentado por perguntas_leitura/respostas_leitura; isto resolve
 * só os nomes.
 */
async function buscarPerfisAutores(ids: ReadonlySet<string>): Promise<PerfisPorId> {
  if (ids.size === 0) return new Map()

  const admin = createAdminSupabase()
  const { data } = await admin
    .from('profiles')
    .select('id, full_name, role, area_id, status')
    .in('id', [...ids])

  return new Map((data ?? []).map((p): [string, PerfilAutor] => [
    p.id,
    { full_name: p.full_name, role: p.role, area_id: p.area_id, status: p.status },
  ]))
}

/** Perguntas e respostas de uma aula, prontas para a tela. */
export async function listQuestions(lessonId: string): Promise<ForumQuestion[]> {
  const idValido = z.string().uuid().safeParse(lessonId)
  if (!idValido.success) return []

  const ctx = await contextoDaAula(idValido.data)
  if (!ctx) return []

  // Cliente da SESSÃO, não o admin: perguntas_leitura/respostas_leitura
  // sustentam o CONTEÚDO exatamente como em todo outro lugar do projeto
  // (o precedente mais próximo é listAttachments, em attachments.ts) — se
  // um dia a checagem de acesso em contextoDaAula tiver um bug, RLS continua
  // sendo a segunda camada. SELECT_PERGUNTAS não inclui `profiles(...)` (ver
  // o comentário lá): os nomes vêm à parte, por buscarPerfisAutores.
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('questions')
    .select(SELECT_PERGUNTAS)
    .eq('lesson_id', ctx.lessonId)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })

  const linhas = (data ?? []) as unknown as LinhaPergunta[]
  if (linhas.length === 0) return []

  const autorIds = new Set<string>()
  for (const pergunta of linhas) {
    autorIds.add(pergunta.author_id)
    for (const resposta of pergunta.answers) autorIds.add(resposta.author_id)
  }
  const perfis = await buscarPerfisAutores(autorIds)

  return linhas.map((row) => paraForumQuestion(row, ctx.user.id, ctx.podeModerar, ctx.areaId, perfis))
}

/**
 * Perguntas ainda não resolvidas nos cursos que a pessoa gerencia.
 * Sem esta tela o líder não descobre que alguém perguntou, e o fórum morre.
 */
export async function listPendingQuestions(): Promise<PendingQuestion[]> {
  const user = await getCurrentUser()
  if (!user || user.status !== 'active' || user.role === 'member') return []

  // Cliente da SESSÃO: perguntas_leitura sustenta o conteúdo, como em
  // listQuestions. SELECT_FILA_DUVIDAS não inclui `profiles(...)` pelo mesmo
  // motivo documentado lá — os nomes vêm à parte, por buscarPerfisAutores.
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('questions')
    .select(SELECT_FILA_DUVIDAS)
    .is('resolved_at', null)
    .order('created_at', { ascending: true })

  const linhas = ((data ?? []) as unknown as LinhaFilaDuvidas[]).filter((q) =>
    pertenceAFilaDoLider(user, q.lessons.courses.area_id),
  )
  if (linhas.length === 0) return []

  const perfis = await buscarPerfisAutores(new Set(linhas.map((q) => q.author_id)))

  return linhas.map((row) => paraPendingQuestion(row, perfis))
}

export async function askQuestion(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = z
      .object({ lessonId: z.string().uuid(), body: corpoSchema })
      .safeParse(Object.fromEntries(formData))
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

    const ctx = await contextoDaAula(parsed.data.lessonId)
    if (!ctx) return { ok: false, error: 'Você não tem acesso a esta aula.' }

    if (excedeuLimite(await publicacoesRecentes(ctx.user.id), new Date())) {
      return { ok: false, error: 'Você publicou muitas mensagens seguidas. Tente de novo em alguns minutos.' }
    }

    const supabase = await createServerSupabase()
    const { data, error } = await supabase
      .from('questions')
      .insert({ lesson_id: ctx.lessonId, author_id: ctx.user.id, body: parsed.data.body })
      .select('id')
      .single()
    if (error) throw error

    // Avisa os LÍDERES DA ÁREA do curso — não o `owner_id`.
    //
    // A revisão da fase 2 mostrou que `owner_id` não é confiável como
    // destinatário: a política de escrita não o fixa no INSERT nem quando o
    // UPDATE traz um id novo, então um líder consegue gravar qualquer perfil
    // como dono de um curso da própria área. Como este e-mail carrega o corpo
    // da pergunta, os títulos e um link direto, mandá-lo para `owner_id`
    // transformaria isso num canal de envio de conteúdo para quem não gerencia
    // nada. A área do curso é derivada do próprio curso e não é forjável pelo
    // mesmo caminho.
    //
    // A trilha inicial não tem área (area_id null) — sem área não há líder
    // de área para avisar, então o envio é pulado (o INSERT acima já
    // salvou a pergunta de qualquer forma). `.eq('area_id', null)` não seria
    // "IS NULL" no PostgREST, então o guard abaixo evita depender disso.
    if (ctx.areaId) {
      const admin = createAdminSupabase()
      const { data: lideres } = await admin
        .from('profiles')
        .select('id, email')
        .eq('role', 'leader')
        .eq('status', 'active')
        .eq('area_id', ctx.areaId)

      // Exclusão por id, não por e-mail: e-mail é o campo mais mutável do
      // perfil (perfil.ts permite trocar o próprio), e comparar por id é
      // exatamente o dado que já temos em mãos (ctx.user.id).
      const destinatarios = (lideres ?? [])
        .filter((l) => l.id !== ctx.user.id)
        .map((l) => l.email)

      if (destinatarios.length > 0) {
        const conteudo = novaDuvidaEmail({
          alunoNome: ctx.user.fullName,
          aulaTitulo: ctx.lessonTitle,
          cursoTitulo: ctx.courseTitle,
          pergunta: parsed.data.body,
          url: `${process.env.NEXT_PUBLIC_SITE_URL}/curso/${ctx.courseSlug}/aula/${ctx.lessonSlug}`,
        })
        await sendEmail({ to: destinatarios, ...conteudo })
      }
    }

    revalidatePath(`/curso/${ctx.courseSlug}/aula/${ctx.lessonSlug}`)
    revalidatePath('/gerenciar/duvidas')
    return ok({ id: data.id })
  } catch (error) {
    return toActionError(error)
  }
}

export async function answerQuestion(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = z
      .object({ questionId: z.string().uuid(), body: corpoSchema })
      .safeParse(Object.fromEntries(formData))
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

    const admin = createAdminSupabase()
    const { data: pergunta } = await admin
      .from('questions')
      .select('id, lesson_id, author_id, profiles(email, full_name)')
      .eq('id', parsed.data.questionId)
      .maybeSingle()
    if (!pergunta) return { ok: false, error: 'Pergunta não encontrada.' }

    const ctx = await contextoDaAula(pergunta.lesson_id)
    if (!ctx) return { ok: false, error: 'Você não tem acesso a esta aula.' }

    if (excedeuLimite(await publicacoesRecentes(ctx.user.id), new Date())) {
      return { ok: false, error: 'Você publicou muitas mensagens seguidas. Tente de novo em alguns minutos.' }
    }

    const supabase = await createServerSupabase()
    const { data, error } = await supabase
      .from('answers')
      .insert({ question_id: parsed.data.questionId, author_id: ctx.user.id, body: parsed.data.body })
      .select('id')
      .single()
    if (error) throw error

    // Avisa quem perguntou — nunca a própria pessoa, quando ela responde à
    // própria pergunta (ex.: um líder complementando a própria dúvida).
    const autorPergunta = pergunta.profiles as unknown as { email: string; full_name: string } | null
    if (autorPergunta?.email && pergunta.author_id !== ctx.user.id) {
      const conteudo = respostaDuvidaEmail({
        professorNome: ctx.user.fullName,
        aulaTitulo: ctx.lessonTitle,
        resposta: parsed.data.body,
        url: `${process.env.NEXT_PUBLIC_SITE_URL}/curso/${ctx.courseSlug}/aula/${ctx.lessonSlug}`,
      })
      await sendEmail({ to: autorPergunta.email, ...conteudo })
    }

    revalidatePath(`/curso/${ctx.courseSlug}/aula/${ctx.lessonSlug}`)
    revalidatePath('/gerenciar/duvidas')
    return ok({ id: data.id })
  } catch (error) {
    return toActionError(error)
  }
}

/**
 * Ações de moderação (fixar/resolver, sempre restritas a quem modera) e
 * exclusão de pergunta (autor OU quem modera), todas checando quem pode o
 * quê contra ESTE recurso antes de mexer em qualquer linha.
 *
 * `operacao` recebe o cliente da SESSÃO (não o admin) e devolve se a escrita
 * realmente afetou uma linha. Isso importa porque, com o cliente da sessão,
 * uma recusa de RLS não chega como erro — chega como zero linhas afetadas.
 * A checagem de `autorizado` já filtra a esmagadora maioria dos casos antes
 * de chegar aqui, mas ela é código de aplicação; RLS (perguntas_edita/
 * perguntas_apaga, endurecidas nas fases anteriores) é quem sustenta a
 * escrita de verdade agora, e se algum dia a checagem acima tiver um bug,
 * `sucesso: false` é o sinal de que o banco recusou mesmo assim — sem isso,
 * a tela diria "resolvido" numa ação que o banco não fez.
 */
async function moderar(
  formData: FormData,
  operacao: (
    ctx: ContextoDaAula,
    questionId: string,
    supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  ) => Promise<boolean>,
  exigeModeracao: boolean,
  // Só as operações que mexem em resolved_at mudam o que a fila do líder
  // mostra (/gerenciar/duvidas só lista perguntas com resolved_at nulo) —
  // fixar/desafixar não altera isso, e a revalidação extra ali seria inerte.
  afetaFila: boolean,
): Promise<ActionResult<null>> {
  const id = z.string().uuid().safeParse(formData.get('questionId'))
  if (!id.success) return { ok: false, error: 'Pergunta inválida.' }

  const admin = createAdminSupabase()
  const { data: pergunta } = await admin
    .from('questions')
    .select('id, lesson_id, author_id')
    .eq('id', id.data)
    .maybeSingle()
  if (!pergunta) return { ok: false, error: 'Pergunta não encontrada.' }

  const ctx = await contextoDaAula(pergunta.lesson_id)
  if (!ctx) return { ok: false, error: 'Você não tem acesso a esta aula.' }

  const autorizado = exigeModeracao
    ? ctx.podeModerar
    : ctx.podeModerar || pergunta.author_id === ctx.user.id
  if (!autorizado) return { ok: false, error: 'Você não tem permissão para esta ação.' }

  const supabase = await createServerSupabase()
  const sucesso = await operacao(ctx, id.data, supabase)
  if (!sucesso) return { ok: false, error: 'Você não tem permissão para esta ação.' }

  revalidatePath(`/curso/${ctx.courseSlug}/aula/${ctx.lessonSlug}`)
  if (afetaFila) revalidatePath('/gerenciar/duvidas')
  return ok(null)
}

export async function togglePinned(_prev: unknown, formData: FormData): Promise<ActionResult<null>> {
  try {
    return await moderar(
      formData,
      async (_ctx, questionId, supabase) => {
        const { data: atual, error: erroLeitura } = await supabase
          .from('questions')
          .select('is_pinned')
          .eq('id', questionId)
          .maybeSingle()
        if (erroLeitura) throw erroLeitura
        if (!atual) return false

        const { data, error } = await supabase
          .from('questions')
          .update({ is_pinned: !atual.is_pinned })
          .eq('id', questionId)
          .select('id')
        if (error) throw error
        return (data?.length ?? 0) > 0
      },
      true,
      false,
    )
  } catch (error) {
    return toActionError(error)
  }
}

export async function toggleResolved(_prev: unknown, formData: FormData): Promise<ActionResult<null>> {
  try {
    return await moderar(
      formData,
      async (_ctx, questionId, supabase) => {
        const { data: atual, error: erroLeitura } = await supabase
          .from('questions')
          .select('resolved_at')
          .eq('id', questionId)
          .maybeSingle()
        if (erroLeitura) throw erroLeitura
        if (!atual) return false

        const { data, error } = await supabase
          .from('questions')
          .update({ resolved_at: atual.resolved_at ? null : new Date().toISOString() })
          .eq('id', questionId)
          .select('id')
        if (error) throw error
        return (data?.length ?? 0) > 0
      },
      true,
      true,
    )
  } catch (error) {
    return toActionError(error)
  }
}

export async function deleteQuestion(_prev: unknown, formData: FormData): Promise<ActionResult<null>> {
  try {
    return await moderar(
      formData,
      async (_ctx, questionId, supabase) => {
        const { data, error } = await supabase.from('questions').delete().eq('id', questionId).select('id')
        if (error) throw error
        return (data?.length ?? 0) > 0
      },
      false,
      false,
    )
  } catch (error) {
    return toActionError(error)
  }
}

export async function deleteAnswer(_prev: unknown, formData: FormData): Promise<ActionResult<null>> {
  try {
    const id = z.string().uuid().safeParse(formData.get('answerId'))
    if (!id.success) return { ok: false, error: 'Resposta inválida.' }

    const admin = createAdminSupabase()
    const { data: resposta } = await admin
      .from('answers')
      .select('id, author_id, questions(lesson_id)')
      .eq('id', id.data)
      .maybeSingle()
    if (!resposta) return { ok: false, error: 'Resposta não encontrada.' }

    const lessonId = (resposta.questions as unknown as { lesson_id: string }).lesson_id
    const ctx = await contextoDaAula(lessonId)
    if (!ctx) return { ok: false, error: 'Você não tem acesso a esta aula.' }

    if (!ctx.podeModerar && resposta.author_id !== ctx.user.id) {
      return { ok: false, error: 'Você não tem permissão para esta ação.' }
    }

    // Cliente da sessão: respostas_apaga (autor OU quem gerencia o curso) é
    // quem sustenta esta exclusão agora — mesmo raciocínio de moderar(), só
    // que deleteAnswer não usa esse helper (a permissão de apagar resposta
    // não depende de "ser a pergunta", então nunca compartilhou o helper).
    const supabase = await createServerSupabase()
    const { data, error } = await supabase.from('answers').delete().eq('id', id.data).select('id')
    if (error) throw error
    if (!data || data.length === 0) {
      return { ok: false, error: 'Você não tem permissão para esta ação.' }
    }

    revalidatePath(`/curso/${ctx.courseSlug}/aula/${ctx.lessonSlug}`)
    return ok(null)
  } catch (error) {
    return toActionError(error)
  }
}
