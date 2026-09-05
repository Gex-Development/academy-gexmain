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
  /** Áreas EXTRAS de leitura (area_access). Não inclui a área principal. */
  extraAreaIds: string[]
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
  const [{ data }, { data: extras }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, role, area_id, status, areas(name)')
      .order('full_name'),
    // Sem filtro por usuário: quem chega aqui já é admin, e a política
    // areas_extras_leitura devolve todas as linhas para admin ativo.
    supabase.from('area_access').select('user_id, area_id'),
  ])

  const extrasPorPessoa = new Map<string, string[]>()
  for (const linha of extras ?? []) {
    const lista = extrasPorPessoa.get(linha.user_id) ?? []
    lista.push(linha.area_id)
    extrasPorPessoa.set(linha.user_id, lista)
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role as Role,
    areaId: row.area_id,
    areaName: (row.areas as { name: string } | null)?.name ?? null,
    status: row.status as UserStatus,
    extraAreaIds: extrasPorPessoa.get(row.id) ?? [],
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

    // getAll, não Object.fromEntries: caixas de seleção mandam o mesmo nome
    // várias vezes, e fromEntries guarda só a ÚLTIMA. Se o schema acima
    // tentasse ler daqui, só uma área extra sobreviveria — silenciosamente.
    const extrasPedidas = formData.getAll('extraAreaIds').map(String)
    const uuid = z.string().uuid()
    if (extrasPedidas.some((id) => !uuid.safeParse(id).success)) {
      return { ok: false, error: 'Área inválida.' }
    }

    const areaPrincipal = parsed.data.areaId || null
    // A área principal já libera pela regra 6; guardá-la também como extra
    // seria linha redundante e deixaria a tela mostrando duas verdades para
    // o mesmo fato.
    const extras = new Set(extrasPedidas.filter((id) => id !== areaPrincipal))

    const supabase = await createServerSupabase()
    const { error } = await supabase
      .from('profiles')
      .update({ role: parsed.data.role, area_id: areaPrincipal })
      .eq('id', parsed.data.id)

    if (error) throw error

    // Só DEPOIS que o perfil gravou. Diferença, não apaga-e-recria: recriar
    // deixaria uma janela em que a pessoa fica sem o acesso que ela já
    // tinha, e perderia quem concedeu e quando.
    const { data: atuais, error: leituraError } = await supabase
      .from('area_access')
      .select('area_id')
      .eq('user_id', parsed.data.id)
    if (leituraError) throw leituraError

    const jaTem = new Set((atuais ?? []).map((linha) => linha.area_id))
    const paraRemover = [...jaTem].filter((id) => !extras.has(id))
    const paraAcrescentar = [...extras].filter((id) => !jaTem.has(id))

    if (paraRemover.length > 0) {
      const { error: removeError } = await supabase
        .from('area_access')
        .delete()
        .eq('user_id', parsed.data.id)
        .in('area_id', paraRemover)
      if (removeError) throw removeError
    }

    if (paraAcrescentar.length > 0) {
      const { error: insereError } = await supabase.from('area_access').insert(
        paraAcrescentar.map((areaId) => ({
          user_id: parsed.data.id,
          area_id: areaId,
          granted_by: currentUser.id,
        })),
      )
      if (insereError) throw insereError
    }

    revalidatePath('/admin/pessoas')
    // A vitrine e a página de área mudam para quem recebeu ou perdeu acesso.
    revalidatePath('/')
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
