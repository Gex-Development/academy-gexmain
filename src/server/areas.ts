'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { assertRole } from '@/lib/auth/guards'
import { getCurrentUser } from '@/lib/auth/session'
import { slugify } from '@/lib/slug'
import { createServerSupabase } from '@/lib/supabase/server'
import { ok, toActionError, type ActionResult } from './result'

export type AreaRow = {
  id: string
  name: string
  slug: string
  description: string | null
  color: string | null
  position: number
}

const areaSchema = z.object({
  name: z.string().trim().min(2, 'O nome precisa de ao menos 2 caracteres.').max(60),
  description: z.string().trim().max(280).optional().or(z.literal('')),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Use uma cor no formato #RRGGBB.')
    .optional()
    .or(z.literal('')),
  position: z.coerce.number().int().min(0).max(999).default(0),
})

export async function listAreas(): Promise<AreaRow[]> {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('areas')
    .select('id, name, slug, description, color, position')
    .order('position')
    .order('name')
  return data ?? []
}

export async function createArea(_prev: unknown, formData: FormData): Promise<ActionResult<AreaRow>> {
  try {
    assertRole(await getCurrentUser(), ['admin'])

    const parsed = areaSchema.safeParse(Object.fromEntries(formData))
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message }
    }

    const slug = slugify(parsed.data.name)
    if (!slug) return { ok: false, error: 'O nome precisa conter letras ou números.' }

    const supabase = await createServerSupabase()
    const { data, error } = await supabase
      .from('areas')
      .insert({
        name: parsed.data.name,
        slug,
        description: parsed.data.description || null,
        color: parsed.data.color || null,
        position: parsed.data.position,
      })
      .select('id, name, slug, description, color, position')
      .single()

    if (error) {
      if (error.code === '23505') return { ok: false, error: 'Já existe uma área com esse nome.' }
      throw error
    }

    revalidatePath('/admin/areas')
    return ok(data)
  } catch (error) {
    return toActionError(error)
  }
}

export async function updateArea(_prev: unknown, formData: FormData): Promise<ActionResult<AreaRow>> {
  try {
    assertRole(await getCurrentUser(), ['admin'])

    const id = z.string().uuid().safeParse(formData.get('id'))
    if (!id.success) return { ok: false, error: 'Área inválida.' }

    const parsed = areaSchema.safeParse(Object.fromEntries(formData))
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

    const supabase = await createServerSupabase()
    const { data, error } = await supabase
      .from('areas')
      .update({
        name: parsed.data.name,
        description: parsed.data.description || null,
        color: parsed.data.color || null,
        position: parsed.data.position,
      })
      .eq('id', id.data)
      .select('id, name, slug, description, color, position')
      .single()

    if (error) throw error

    revalidatePath('/admin/areas')
    return ok(data)
  } catch (error) {
    return toActionError(error)
  }
}
