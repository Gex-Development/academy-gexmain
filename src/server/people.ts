'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { Role, UserStatus } from '@/lib/access'
import { assertRole } from '@/lib/auth/guards'
import { getCurrentUser } from '@/lib/auth/session'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createServerSupabase } from '@/lib/supabase/server'
import { ok, toActionError, type ActionResult } from './result'

export type PersonRow = {
  id: string
  fullName: string
  email: string
  role: Role
  areaId: string | null
  areaName: string | null
  status: UserStatus
}

const papel = z.enum(['admin', 'leader', 'member'])

const inviteSchema = z
  .object({
    fullName: z.string().trim().min(3, 'Informe o nome completo.').max(120),
    email: z.string().trim().toLowerCase().email('E-mail inválido.'),
    role: papel,
    areaId: z.string().uuid().optional().or(z.literal('')),
  })
  .refine((v) => v.role === 'admin' || !!v.areaId, {
    message: 'Colaboradores e líderes precisam de uma área.',
    path: ['areaId'],
  })

export async function listPeople(): Promise<PersonRow[]> {
  // Este arquivo é 'use server': cada export é um endpoint chamável. O RLS já
  // limitaria o retorno, mas a checagem explícita é a regra do projeto.
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin' || user.status !== 'active') return []

  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, area_id, status, areas(name)')
    .order('full_name')

  return (data ?? []).map((row) => ({
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role as Role,
    areaId: row.area_id,
    areaName: (row.areas as { name: string } | null)?.name ?? null,
    status: row.status as UserStatus,
  }))
}

export async function invitePerson(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    assertRole(await getCurrentUser(), ['admin'])

    const parsed = inviteSchema.safeParse(Object.fromEntries(formData))
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

    const { fullName, email, role, areaId } = parsed.data
    const admin = createAdminSupabase()

    // O convite do Supabase Auth envia o e-mail e cria o usuário sem senha.
    // O redirect passa por /auth/confirm (não direto para /convite): é essa
    // rota que troca o token_hash do link por sessão via verifyOtp — sem
    // isso a pessoa cai em /convite sem sessão nenhuma, e o updateUser da
    // troca de senha falha.
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm?next=/convite`,
      data: { full_name: fullName },
    })

    if (error) {
      if (error.message.toLowerCase().includes('already')) {
        return { ok: false, error: 'Já existe uma conta com esse e-mail.' }
      }
      throw error
    }

    const { error: profileError } = await admin.from('profiles').insert({
      id: data.user.id,
      full_name: fullName,
      email,
      role,
      area_id: role === 'admin' ? (areaId || null) : areaId!,
      status: 'invited',
    })

    if (profileError) {
      // Sem perfil o usuário não consegue usar nada: desfaz o convite para não
      // deixar uma conta órfã no Auth. deleteUser não lança em falha de API —
      // devolve { error } — então essa falha precisa ser conferida também, ou
      // o rollback pode "silenciosamente" não acontecer.
      try {
        const { error: rollbackError } = await admin.auth.admin.deleteUser(data.user.id)
        if (rollbackError) throw rollbackError
      } catch (rollbackError) {
        // O pior caso: nem o perfil foi criado, nem o convite pôde ser desfeito.
        // O e-mail fica preso no Auth, não pode ser reconvidado, e só dá para
        // resolver manualmente — por isso a mensagem nomeia o e-mail, e o log
        // guarda os dois erros (não só o mais recente) para quem for investigar.
        console.error('[invitePerson] falha ao desfazer convite órfão; requer limpeza manual', {
          email,
          profileError,
          rollbackError,
        })
        return {
          ok: false,
          error:
            `Não foi possível concluir o convite, e também não foi possível desfazê-lo. ` +
            `O e-mail ${email} ficou preso no Supabase Auth — peça ao time técnico para removê-lo ` +
            `manualmente antes de tentar convidar essa pessoa de novo.`,
        }
      }

      throw profileError
    }

    revalidatePath('/admin/pessoas')
    return ok({ id: data.user.id })
  } catch (error) {
    return toActionError(error)
  }
}

const updateSchema = z
  .object({
    id: z.string().uuid(),
    role: papel,
    areaId: z.string().uuid().optional().or(z.literal('')),
  })
  .refine((v) => v.role === 'admin' || !!v.areaId, {
    message: 'Colaboradores e líderes precisam de uma área.',
    path: ['areaId'],
  })

export async function updatePerson(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const currentUser = assertRole(await getCurrentUser(), ['admin'])

    const parsed = updateSchema.safeParse(Object.fromEntries(formData))
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

    if (parsed.data.id === currentUser.id && parsed.data.role !== 'admin') {
      return { ok: false, error: 'Você não pode remover o próprio acesso de admin.' }
    }

    const supabase = await createServerSupabase()
    const { error } = await supabase
      .from('profiles')
      .update({ role: parsed.data.role, area_id: parsed.data.areaId || null })
      .eq('id', parsed.data.id)

    if (error) throw error

    revalidatePath('/admin/pessoas')
    return ok({ id: parsed.data.id })
  } catch (error) {
    return toActionError(error)
  }
}

const statusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['active', 'inactive']),
})

export async function setPersonStatus(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const currentUser = assertRole(await getCurrentUser(), ['admin'])

    const parsed = statusSchema.safeParse(Object.fromEntries(formData))
    if (!parsed.success) return { ok: false, error: 'Dados inválidos.' }

    if (parsed.data.id === currentUser.id && parsed.data.status === 'inactive') {
      return { ok: false, error: 'Você não pode desativar a si mesmo.' }
    }

    const supabase = await createServerSupabase()
    const { error } = await supabase
      .from('profiles')
      .update({ status: parsed.data.status })
      .eq('id', parsed.data.id)

    if (error) throw error

    revalidatePath('/admin/pessoas')
    return ok({ id: parsed.data.id })
  } catch (error) {
    return toActionError(error)
  }
}
