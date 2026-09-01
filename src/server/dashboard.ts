'use server'

import { getCurrentUser } from '@/lib/auth/session'
import { createAdminSupabase } from '@/lib/supabase/admin'
import {
  montarPainel,
  SELECT_PAINEL_CURSOS,
  SELECT_PAINEL_LIBERACOES,
  SELECT_PAINEL_PERFIS,
  SELECT_PAINEL_PROGRESSO,
  type CourseStats,
  type LinhaCursoPainel,
  type LinhaLiberacaoPainel,
  type LinhaPerfilPainel,
  type LinhaProgressoPainel,
  type PersonProgress,
} from './dashboard-query'

// Um arquivo 'use server' só pode exportar funções async (mesmo motivo
// documentado em catalog.ts) — por isso os tipos, os SELECTs, os
// mapeadores e a conta em si moram em dashboard-query.ts. Aqui só o tipo
// (apagado em compilação, não conta como export de runtime) é reexportado.
export type { CourseStats, PersonProgress }

/**
 * Painel de acompanhamento: progresso por pessoa e por curso, em
 * `/gerenciar/progresso` (guarda de papel em `src/app/(manage)/layout.tsx`
 * — admin ou líder ativo; a checagem abaixo é a mesma regra repetida aqui
 * porque `getDashboard` também podia ser chamado fora dessa rota).
 *
 * CHAVE DE SERVIÇO, e por que o cliente da sessão não bastaria (ao
 * contrário do fórum, onde bastou — ver o comentário equivalente em
 * forum-query.ts/forum.ts): a política `liberacoes_leitura` (migration
 * 0003, ajustada na 0004) libera leitura de `course_access` só para "a
 * própria linha OU admin". Sob o cliente da sessão, um LÍDER nunca
 * enxergaria a liberação avulsa de outra pessoa — a consulta não falha,
 * simplesmente volta vazia, e o painel mostraria "0 com acesso" em todo
 * curso, errado e em silêncio. `createAdminSupabase()` ignora RLS de
 * propósito para poder somar perfis, cursos, liberações e progresso de
 * TODO MUNDO numa só leitura.
 *
 * CONSEQUÊNCIA que isso traz: para o líder, o filtro por área em memória
 * (`visivelParaGestor`, em dashboard-query.ts) é a ÚNICA barreira entre ele
 * e os dados de outra área — não há RLS por baixo sustentando a mesma
 * garantia, ao contrário de todo o resto do projeto. É por isso que aquele
 * predicado tem os testes que tem (dashboard-query.test.ts, inclusive o
 * caso do líder sem área): um bug ali vaza pessoas e cursos de fora, sem
 * nenhuma segunda camada para conter o erro.
 */
export async function getDashboard(): Promise<{ pessoas: PersonProgress[]; cursos: CourseStats[] }> {
  const atual = await getCurrentUser()
  if (!atual || atual.status !== 'active' || atual.role === 'member') {
    return { pessoas: [], cursos: [] }
  }

  const admin = createAdminSupabase()

  const [perfisRes, cursosRes, liberacoesRes, progressoRes] = await Promise.all([
    admin.from('profiles').select(SELECT_PAINEL_PERFIS).eq('status', 'active').order('full_name'),
    admin.from('courses').select(SELECT_PAINEL_CURSOS),
    admin.from('course_access').select(SELECT_PAINEL_LIBERACOES),
    admin.from('lesson_progress').select(SELECT_PAINEL_PROGRESSO),
  ])
  // `error` não é descartado em nenhuma das quatro: se qualquer consulta
  // falhar (embed ambíguo, RLS regredida etc.), `data` vem `null`, e o
  // `?? []` de antes fazia a tela renderizar "Todo mundo concluiu a trilha
  // inicial" — uma resposta errada, afirmativa e tranquilizadora, para a
  // pergunta que é a razão de esta tela existir. Mesmo raciocínio de
  // listAccessRequests, em access-requests.ts.
  if (perfisRes.error) throw perfisRes.error
  if (cursosRes.error) throw cursosRes.error
  if (liberacoesRes.error) throw liberacoesRes.error
  if (progressoRes.error) throw progressoRes.error

  return montarPainel(
    atual,
    (perfisRes.data ?? []) as unknown as LinhaPerfilPainel[],
    (cursosRes.data ?? []) as unknown as LinhaCursoPainel[],
    (liberacoesRes.data ?? []) as LinhaLiberacaoPainel[],
    (progressoRes.data ?? []) as LinhaProgressoPainel[],
  )
}
