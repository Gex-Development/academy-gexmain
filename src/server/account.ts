'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
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

    const { data, error } = await supabase
      .from('profiles')
      .update({ status: 'active' })
      .eq('id', user.id)
      .eq('status', 'invited')
      .select('id')

    if (error) throw error

    // Um update barrado por RLS (ou pelo filtro .eq('status', 'invited') não
    // batendo mais) devolve sucesso com zero linhas afetadas, não erro. Sem
    // esta checagem, a tela redireciona para "/" achando que ativou a conta;
    // o layout então vê status ainda 'invited' e manda de volta para
    // /convite — um loop silencioso, sem nenhuma mensagem para a pessoa.
    if (!data || data.length === 0) {
      return {
        ok: false,
        error: 'Não foi possível ativar a conta. Peça um novo link de convite ao administrador.',
      }
    }

    revalidatePath('/', 'layout')
    return ok(null)
  } catch (error) {
    return toActionError(error)
  }
}

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

    const { data, error } = await supabase
      .from('profiles')
      .update({
        full_name: parsed.data.fullName,
        avatar_url: parsed.data.avatarUrl || null,
      })
      .eq('id', user.id)
      .select('id')

    if (error) throw error

    // Mesmo raciocínio de activateAccount: um update que não bate em nenhuma
    // política (por exemplo uma pessoa desativada entre o carregamento da
    // tela e o clique em "Salvar" — profiles_edita_o_proprio exige
    // auth_is_active()) devolve sucesso com zero linhas, e sem esta checagem
    // a tela diria "Perfil salvo." sem ter salvado nada.
    if (!data || data.length === 0) {
      return { ok: false, error: 'Não foi possível salvar o perfil. Faça login novamente.' }
    }

    revalidatePath('/perfil')
    revalidatePath('/', 'layout')
    return ok(null)
  } catch (error) {
    return toActionError(error)
  }
}
