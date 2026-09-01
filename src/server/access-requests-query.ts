// Lógica pura de access-requests.ts: um arquivo 'use server' só pode
// exportar funções async (mesmo motivo documentado em forum.ts) — por isso
// os SELECTs, os tipos de linha crua e o mapeamento moram aqui, testáveis
// sem cookies() e importáveis por tests/db/access-requests.test.ts, que roda
// a MESMA string de select que a produção usa contra o Postgres de verdade
// em vez de uma reimplementada à parte.
//
// `profiles` tem DUAS chaves estrangeiras em `access_requests` — `user_id` e
// `decided_by` (0001_schema_inicial.sql, linhas 116 e 120). Um embed
// `profiles(...)` sem qualificar qual delas é AMBÍGUO para o PostgREST: a
// API devolve HTTP 300 (PGRST201) em vez de dados. Foi exatamente o defeito
// da primeira versão desta tarefa — silencioso porque quem chamava descartava
// o `error` e o `as unknown as Linha[]` que envolvia o resultado apagava o
// `SelectQueryError` que o supabase-js geraria para um embed ambíguo. Os
// dois SELECTs abaixo qualificam `profiles` com a FK certa
// (`!access_requests_user_id_fkey`); `areas(name)` e `courses(...)` têm uma
// FK só cada e não precisam de qualificador.

export type PendingRequest = {
  id: string
  createdAt: string
  message: string | null
  personName: string
  personEmail: string
  areaName: string | null
  courseTitle: string
}

export const SELECT_FILA_SOLICITACOES =
  'id, created_at, message, profiles!access_requests_user_id_fkey(full_name, email, areas(name)), courses(title)'

export type LinhaFilaSolicitacoes = {
  id: string
  created_at: string
  message: string | null
  profiles: { full_name: string; email: string; areas: { name: string } | null } | null
  courses: { title: string } | null
}

/** Linha real (SELECT_FILA_SOLICITACOES) para o formato que a tela usa. */
export function paraPendingRequest(row: LinhaFilaSolicitacoes): PendingRequest {
  return {
    id: row.id,
    createdAt: row.created_at,
    message: row.message,
    personName: row.profiles?.full_name ?? 'Colaborador',
    personEmail: row.profiles?.email ?? '',
    areaName: row.profiles?.areas?.name ?? null,
    courseTitle: row.courses?.title ?? 'Curso',
  }
}

// Leitura de contexto que decideAccessRequest faz antes de decidir: precisa
// de user_id/course_id (para o INSERT em course_access) e do e-mail/curso
// (para o e-mail de decisão e para saber qual /curso/[slug] revalidar).
export const SELECT_SOLICITACAO_DECISAO =
  'id, user_id, course_id, status, profiles!access_requests_user_id_fkey(email), courses(title, slug)'

export type LinhaSolicitacaoDecisao = {
  id: string
  user_id: string
  course_id: string
  status: string
  profiles: { email: string } | null
  courses: { title: string; slug: string } | null
}
