'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabase } from '@/lib/supabase/server'
import { ok, toActionError, type ActionResult } from './result'

/**
 * Marca o perfil como ativo depois que a pessoa define a senha pelo convite.
 * Roda com a sessão da própria pessoa e só altera o próprio registro.
 */
export async function activateAccount(): Promise<ActionResult<null>> {
  try {
    const supabase = await createServerSupabase()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Sessão expirada. Abra o link do convite novamente.' }

    const { error } = await supabase
      .from('profiles')
      .update({ status: 'active' })
      .eq('id', user.id)
      .eq('status', 'invited')

    if (error) throw error

    revalidatePath('/', 'layout')
    return ok(null)
  } catch (error) {
    return toActionError(error)
  }
}

import { z } from 'zod'

const perfilSchema = z.object({
  fullName: z.string().trim().min(3, 'Informe o nome completo.').max(120),
  avatarUrl: z.string().trim().url('A foto precisa ser uma URL válida.').optional().or(z.literal('')),
})

/** Atualiza nome e foto do próprio perfil. Ninguém edita o perfil alheio por aqui. */
export async function updateProfile(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const supabase = await createServerSupabase()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Faça login para continuar.' }

    const parsed = perfilSchema.safeParse(Object.fromEntries(formData))
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: parsed.data.fullName,
        avatar_url: parsed.data.avatarUrl || null,
      })
      .eq('id', user.id)

    if (error) throw error

    revalidatePath('/perfil')
    revalidatePath('/', 'layout')
    return ok(null)
  } catch (error) {
    return toActionError(error)
  }
}
