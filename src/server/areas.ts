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
  coverUrl: string | null
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
  coverUrl: z.string().trim().url('A capa precisa ser uma URL válida.').optional().or(z.literal('')),
})

export async function listAreas(): Promise<AreaRow[]> {
  // Este arquivo é 'use server': cada export é um endpoint chamável (mesma
  // regra aplicada em listPeople, server/people.ts). Áreas são legíveis por
  // qualquer colaborador ativo por design — não restringe a admin — mas a
  // sessão precisa existir e estar ativa; o RLS já limitaria o retorno, mas a
  // checagem explícita é a regra do projeto.
  const user = await getCurrentUser()
  if (!user || user.status !== 'active') return []

  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('areas')
    .select('id, name, slug, description, color, position, cover_url')
    .order('position')
    .order('name')

  if (error) {
    console.error('[listAreas]', error)
    return []
  }

  return (data ?? []).map((linha) => ({
    id: linha.id,
    name: linha.name,
    slug: linha.slug,
    description: linha.description,
    color: linha.color,
    position: linha.position,
    coverUrl: linha.cover_url,
  }))
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
        cover_url: parsed.data.coverUrl || null,
      })
      .select('id, name, slug, description, color, position, cover_url')
      .single()

    if (error) {
      // A constraint única é no slug (derivado do nome), não no nome em si:
      // "SEO!!!" e "SEO???" geram o mesmo slug e colidem, mesmo sendo nomes
      // diferentes — por isso a mensagem fala em "nome parecido", não "esse
      // nome", para o admin conseguir agir (tentar um nome mais distinto) em
      // vez de ficar procurando um nome idêntico que não existe.
      if (error.code === '23505') {
        return {
          ok: false,
          error: 'Já existe uma área com um nome parecido (o identificador gerado colide com o de outra área).',
        }
      }
      throw error
    }

    revalidatePath('/admin/areas')
    return ok({
      id: data.id,
      name: data.name,
      slug: data.slug,
      description: data.description,
      color: data.color,
      position: data.position,
      coverUrl: data.cover_url,
    })
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
        cover_url: parsed.data.coverUrl || null,
      })
      .eq('id', id.data)
      .select('id, name, slug, description, color, position, cover_url')
      .single()

    if (error) throw error

    revalidatePath('/admin/areas')
    return ok({
      id: data.id,
      name: data.name,
      slug: data.slug,
      description: data.description,
      color: data.color,
      position: data.position,
      coverUrl: data.cover_url,
    })
  } catch (error) {
    return toActionError(error)
  }
}
