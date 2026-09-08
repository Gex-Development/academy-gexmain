'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { assertRole } from '@/lib/auth/guards'
import { getCurrentUser } from '@/lib/auth/session'
import { slugify } from '@/lib/slug'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createServerSupabase } from '@/lib/supabase/server'
import { apagarCapaSubstituida } from '@/server/capas-upload'
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

// Forma da linha que as três consultas abaixo selecionam.
type LinhaArea = {
  id: string
  name: string
  slug: string
  description: string | null
  color: string | null
  position: number
  cover_url: string | null
}

// snake_case do banco -> camelCase de AreaRow, num só lugar: listAreas,
// createArea e updateArea repetiam este mapeamento de 7 campos cada um: a
// próxima coluna que a tabela ganhar só precisaria ser lembrada aqui.
// Não exportado — um módulo 'use server' só pode exportar funções async
// (regra do projeto), e esta é síncrona; não mora no irmão -query.ts porque
// é mapeamento trivial de uma única tabela, sem lógica para testar isolada.
function toAreaRow(linha: LinhaArea): AreaRow {
  return {
    id: linha.id,
    name: linha.name,
    slug: linha.slug,
    description: linha.description,
    color: linha.color,
    position: linha.position,
    coverUrl: linha.cover_url,
  }
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

  return (data ?? []).map(toAreaRow)
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

    // Id opcional vindo do formulário (area-form.tsx o gera no navegador).
    // Existe para o upload de capa poder acontecer ANTES de a área existir:
    // o arquivo é guardado em `area/<id>/...`, então o id precisa ser
    // conhecido antes da gravação. Lido separado do areaSchema porque esse
    // schema também serve o updateArea, que já trata o id do seu jeito.
    //
    // Ausente, o Postgres gera como sempre — quem chamar sem id continua
    // funcionando igual.
    const idBruto = formData.get('id')
    const idInformado = z.string().uuid().safeParse(idBruto)
    if (idBruto != null && idBruto !== '' && !idInformado.success) {
      return { ok: false, error: 'Identificador inválido.' }
    }

    const supabase = await createServerSupabase()
    const { data, error } = await supabase
      .from('areas')
      .insert({
        ...(idInformado.success ? { id: idInformado.data } : {}),
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
        // Duas constraints únicas diferentes chegam aqui com o mesmo código.
        // Sem distinguir, uma área criada duas vezes pelo mesmo formulário
        // (id repetido) mostraria "nome parecido" — mandando a pessoa
        // procurar um conflito de nome que não existe.
        const violouChavePrimaria = `${error.message} ${error.details ?? ''}`.includes('areas_pkey')
        return {
          ok: false,
          error: violouChavePrimaria
            ? 'Esta área já foi criada. Atualize a página para vê-la na lista.'
            : 'Já existe uma área com um nome parecido (o identificador gerado colide com o de outra área).',
        }
      }
      throw error
    }

    revalidatePath('/admin/areas')
    return ok(toAreaRow(data))
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

    // Capa ANTES da gravação — só para decidir, depois que a escrita já deu
    // certo, se sobrou uma capa velha para apagar do Storage. Lida antes de
    // qualquer coisa: é a última chance de ver o valor que está prestes a
    // ser sobrescrito.
    const { data: antes } = await supabase.from('areas').select('cover_url').eq('id', id.data).maybeSingle()

    const novaCapa = parsed.data.coverUrl || null
    const { data, error } = await supabase
      .from('areas')
      .update({
        name: parsed.data.name,
        description: parsed.data.description || null,
        color: parsed.data.color || null,
        position: parsed.data.position,
        cover_url: novaCapa,
      })
      .eq('id', id.data)
      .select('id, name, slug, description, color, position, cover_url')
      .single()

    if (error) throw error

    // Só DEPOIS que a gravação teve sucesso: se a capa mudou, apaga a
    // antiga do Storage (se for nossa). Nunca antes — ver o comentário de
    // apagarCapaSubstituida (src/server/capas-upload.ts) para o porquê:
    // apagar no momento do upload, e não no do Salvar, foi o bug que gerou
    // a rodada de correção anterior. `data` (não `novaCapa`) é a PROVA —
    // veio de volta do próprio UPDATE, não do texto do formulário — que
    // apagarCapaSubstituida exige antes de apagar qualquer coisa.
    if (antes?.cover_url && antes.cover_url !== novaCapa) {
      const admin = createAdminSupabase()
      await apagarCapaSubstituida(admin, 'area', id.data, antes.cover_url, data)
    }

    revalidatePath('/admin/areas')
    return ok(toAreaRow(data))
  } catch (error) {
    return toActionError(error)
  }
}
