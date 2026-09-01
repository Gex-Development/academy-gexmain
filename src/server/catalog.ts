'use server'

import { getCurrentUser } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import {
  montarCatalogo,
  paraCatalogItem,
  SELECT_CATALOGO,
  type Catalog,
  type CatalogItem,
  type LinhaCatalogo,
} from './catalog-query'

// Um arquivo 'use server' só pode exportar funções async — por isso os tipos e
// a lógica de montagem moram em catalog-query.ts (ver comentário lá). Aqui só
// o tipo (apagado em tempo de compilação, não conta como export de runtime) é
// reexportado, para quem importa `type CatalogItem`/`Catalog` daqui continuar
// funcionando — é o caso de src/components/catalog/course-card.tsx.
export type { Catalog, CatalogItem }

/**
 * Vitrine da empresa inteira.
 *
 * Todo curso publicado aparece, inclusive os que a pessoa não pode abrir — é
 * assim que ela descobre o que existe e pede acesso. O que NUNCA sai daqui é
 * conteúdo: nem aula, nem vídeo, nem anexo. Só capa, título, área, descrição
 * e contagem de aulas.
 *
 * Função pura de rede: é ela quem estabelece quem está chamando (nenhum
 * componente sob src/app ou src/components faz isso), e é ela quem decide
 * "sem sessão ativa, vitrine vazia" em vez de deixar o RLS decidir sozinho.
 */
export async function getCatalog(): Promise<Catalog> {
  const user = await getCurrentUser()
  if (!user || user.status !== 'active') return { onboarding: null, grupos: [] }

  const supabase = await createServerSupabase()

  const [{ data: cursos }, { data: liberacoes }, { data: solicitacoes }] = await Promise.all([
    supabase.from('courses').select(SELECT_CATALOGO).eq('status', 'published'),
    supabase.from('course_access').select('course_id').eq('user_id', user.id),
    supabase.from('access_requests').select('course_id').eq('user_id', user.id).eq('status', 'pending'),
  ])

  // A contagem de aulas vem de uma função SECURITY DEFINER, não de um join.
  // RLS é por LINHA: uma política que deixasse contar as aulas de um curso
  // bloqueado deixaria ler o `video_ref` junto — e para vídeo não listado do
  // YouTube o ref é o acesso. A função devolve só o número (ver 0004/0005 em
  // supabase/migrations e tests/db/rls.test.ts, describe "contar_aulas_publicadas").
  const { data: contagens } = await supabase.rpc('contar_aulas_publicadas')
  const aulasPorCurso = new Map((contagens ?? []).map((linha) => [linha.course_id, Number(linha.total)]))

  const liberados = new Set((liberacoes ?? []).map((l) => l.course_id))
  const pendentes = new Set((solicitacoes ?? []).map((s) => s.course_id))

  const items = ((cursos ?? []) as unknown as LinhaCatalogo[]).map((row) =>
    paraCatalogItem(row, user, aulasPorCurso, liberados, pendentes),
  )

  return montarCatalogo(items)
}
