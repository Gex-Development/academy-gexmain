'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { canAccessCourse } from '@/lib/access'
import { assertRole } from '@/lib/auth/guards'
import { getCurrentUser } from '@/lib/auth/session'
import { slugify } from '@/lib/slug'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createServerSupabase } from '@/lib/supabase/server'
import { apagarCapaSubstituida } from '@/server/capas-upload'
import {
  paraManagedCourse,
  podePublicar,
  SELECT_CURSO,
  type LinhaCurso,
  type ManagedCourse,
} from './courses-query'
import { ok, toActionError, type ActionResult } from './result'

// Um arquivo 'use server' só pode exportar funções async (Next.js recusa o
// build inteiro se algum export não for) — por isso a consulta, o mapeamento
// e a regra de publicação moraram para courses-query.ts, e aqui só o tipo
// (apagado em tempo de compilação, não conta como export de runtime) é
// reexportado, para quem já importa `type ManagedCourse` daqui continuar
// funcionando.
export type { ManagedCourse }

/** Cursos que o usuário atual pode editar: os da sua área, ou todos, se admin. */
export async function listManagedCourses(): Promise<ManagedCourse[]> {
  const user = await getCurrentUser()
  if (!user || user.status !== 'active') return []
  if (user.role === 'member') return []

  const supabase = await createServerSupabase()
  let query = supabase.from('courses').select(SELECT_CURSO).order('position').order('title')

  if (user.role === 'leader') {
    if (!user.areaId) return []
    query = query.eq('area_id', user.areaId)
  }

  const { data } = await query
  return ((data ?? []) as unknown as LinhaCurso[]).map(paraManagedCourse)
}

export async function getManagedCourse(id: string): Promise<ManagedCourse | null> {
  const user = await getCurrentUser()
  if (!user || user.status !== 'active' || user.role === 'member') return null

  const supabase = await createServerSupabase()
  const { data } = await supabase.from('courses').select(SELECT_CURSO).eq('id', id).maybeSingle()
  if (!data) return null

  const curso = paraManagedCourse(data as unknown as LinhaCurso)
  // Mesma regra de "quem gerencia" que canAccessCourse já centraliza — nada
  // aqui reimplementa a comparação de papel/área à mão. Os dois conjuntos de
  // concessão ficam vazios de propósito: nem liberação individual (regra 8)
  // nem área extra (regra 7) elevam o nível além de 'view', então são
  // irrelevantes para a pergunta "isto é 'manage'?" — e evita duas consultas
  // só para descartar o resultado. O early return de role === 'member'
  // acima garante que só admin/líder chegam aqui.
  return canAccessCourse(user, curso, new Set()) === 'manage' ? curso : null
}

const cursoSchema = z.object({
  title: z.string().trim().min(3, 'O título precisa de ao menos 3 caracteres.').max(120),
  description: z.string().trim().max(600).optional().or(z.literal('')),
  coverUrl: z.string().trim().url('A capa precisa ser uma URL válida.').optional().or(z.literal('')),
  // Só createCourse usa estes dois — updateCourse reenvia o mesmo schema, mas
  // seu formulário nunca inclui estes campos, então .optional() os deixa
  // ausentes sem quebrar o parse. Checkbox de formulário chega como 'on'
  // (marcado) ou ausente (desmarcado) — nunca outro valor por um form normal,
  // mas .string().optional() ainda assim faz o campo passar por Zod, em vez
  // de ser lido cru do FormData, mesmo quando um POST malicioso manda outra
  // coisa: o "!== 'on'" abaixo trata qualquer valor fora de 'on' como
  // desmarcado, igual ao comportamento anterior.
  isOnboarding: z.string().optional(),
  areaId: z.string().uuid('Área inválida.').optional().or(z.literal('')),
})

export async function createCourse(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = assertRole(await getCurrentUser(), ['admin', 'leader'])

    const parsed = cursoSchema.safeParse(Object.fromEntries(formData))
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

    const isOnboarding = parsed.data.isOnboarding === 'on'
    if (isOnboarding && user.role !== 'admin') {
      return { ok: false, error: 'Somente o administrador cria a trilha inicial.' }
    }

    // Admin escolhe a área no formulário; líder cria sempre na própria área.
    const areaIdBruto = user.role === 'admin' ? parsed.data.areaId ?? '' : user.areaId
    const areaId = isOnboarding ? null : areaIdBruto || null
    if (!isOnboarding && !areaId) {
      return { ok: false, error: 'Escolha a área do curso.' }
    }

    const slugBase = slugify(parsed.data.title)
    if (!slugBase) return { ok: false, error: 'O título precisa conter letras ou números.' }

    const supabase = await createServerSupabase()
    const { data, error } = await supabase
      .from('courses')
      .insert({
        title: parsed.data.title,
        slug: `${slugBase}-${Date.now().toString(36)}`,
        description: parsed.data.description || null,
        cover_url: parsed.data.coverUrl || null,
        area_id: areaId,
        is_onboarding: isOnboarding,
        owner_id: user.id,
        status: 'draft',
      })
      .select('id')
      .single()

    if (error) {
      // 'courses' tem duas constraints únicas (slug, e o índice parcial que
      // permite só uma trilha inicial) — as duas levantam 23505. Por isso o
      // código sozinho não basta para decidir qual mensagem mostrar (ao
      // contrário de areas.ts, que só tem uma constraint única e onde o
      // código isolado já é inequívoco): precisa ancorar no código estável
      // E discriminar pelo nome da constraint, ou uma colisão de slug comum
      // mostraria "já existe uma trilha inicial" para quem só bateu o slug.
      if (error.code === '23505' && error.message.includes('courses_uma_trilha_inicial')) {
        return { ok: false, error: 'Já existe uma trilha inicial na plataforma.' }
      }
      throw error
    }

    revalidatePath('/gerenciar')
    return ok({ id: data.id })
  } catch (error) {
    return toActionError(error)
  }
}

export async function updateCourse(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    assertRole(await getCurrentUser(), ['admin', 'leader'])

    const id = z.string().uuid().safeParse(formData.get('id'))
    if (!id.success) return { ok: false, error: 'Curso inválido.' }

    // Confirma que este usuário pode editar ESTE curso, não apenas que é
    // líder. getManagedCourse já traz coverUrl (SELECT_CURSO) — reaproveitado
    // abaixo como a capa ANTES da gravação, sem precisar de uma segunda
    // consulta só para isso.
    const curso = await getManagedCourse(id.data)
    if (!curso) {
      return { ok: false, error: 'Você não tem permissão para editar este curso.' }
    }

    const parsed = cursoSchema.safeParse(Object.fromEntries(formData))
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

    const novaCapa = parsed.data.coverUrl || null
    const supabase = await createServerSupabase()
    // .select('cover_url') aqui não é para o retorno da action (que só
    // devolve o id) — é a PROVA que apagarCapaSubstituida exige: o valor que
    // realmente voltou do UPDATE, não o texto do formulário. Sem essa volta
    // ao Postgres não haveria como distinguir "a gravação confirmou a capa
    // nova" de "ainda nem tentamos gravar".
    const { data: gravado, error } = await supabase
      .from('courses')
      .update({
        title: parsed.data.title,
        description: parsed.data.description || null,
        cover_url: novaCapa,
      })
      .eq('id', id.data)
      .select('cover_url')
      .single()

    if (error) throw error

    // Só DEPOIS que a gravação teve sucesso: se a capa mudou, apaga a
    // antiga do Storage (se for nossa). Nunca antes — ver o comentário de
    // apagarCapaSubstituida (src/server/capas-upload.ts) para o porquê:
    // apagar no momento do upload, e não no do Salvar, foi o bug que gerou
    // a rodada de correção anterior.
    if (curso.coverUrl && curso.coverUrl !== novaCapa) {
      const admin = createAdminSupabase()
      await apagarCapaSubstituida(admin, 'curso', id.data, curso.coverUrl, gravado)
    }

    revalidatePath('/gerenciar')
    revalidatePath(`/gerenciar/cursos/${id.data}`)
    revalidatePath('/')
    return ok({ id: id.data })
  } catch (error) {
    return toActionError(error)
  }
}

export async function setCourseStatus(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    assertRole(await getCurrentUser(), ['admin', 'leader'])

    const parsed = z
      .object({ id: z.string().uuid(), status: z.enum(['draft', 'published']) })
      .safeParse(Object.fromEntries(formData))
    if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }

    const curso = await getManagedCourse(parsed.data.id)
    if (!curso) return { ok: false, error: 'Você não tem permissão para editar este curso.' }

    if (parsed.data.status === 'published' && !podePublicar(curso)) {
      return { ok: false, error: 'Publique ao menos uma aula antes de publicar o curso.' }
    }

    const supabase = await createServerSupabase()
    const { error } = await supabase
      .from('courses')
      .update({ status: parsed.data.status })
      .eq('id', parsed.data.id)

    if (error) throw error

    revalidatePath('/gerenciar')
    revalidatePath(`/gerenciar/cursos/${parsed.data.id}`)
    revalidatePath('/')
    return ok({ id: parsed.data.id })
  } catch (error) {
    return toActionError(error)
  }
}
