import { describe, expect, it } from 'vitest'
import {
  SELECT_PAINEL_CURSOS,
  SELECT_PAINEL_LIBERACOES,
  SELECT_PAINEL_PERFIS,
  SELECT_PAINEL_PROGRESSO,
} from '@/server/dashboard-query'
import { adminClient } from './client'

// Nenhum teste, em nenhum nível, executava estes quatro SELECTs contra o
// Postgres de verdade — montarPainel só é testado com literais escritos à
// mão (dashboard-query.test.ts), e o `as unknown as LinhaPerfilPainel[]` (e
// afins) em dashboard.ts apaga qualquer divergência de FORMA entre o que a
// string de select pede e o que a API realmente devolve (por exemplo
// `areas` voltando array em vez de objeto — foi exatamente esse tipo de
// select ambíguo que derrubou a fila do admin em access-requests, achado da
// própria fase 3).
//
// Mesmo padrão de tests/db/access-requests.test.ts (SELECT_FILA_SOLICITACOES
// / SELECT_SOLICITACAO_DECISAO, mais abaixo naquele arquivo): importa as
// constantes de produção (não redigita a string) e roda cada uma com
// `.limit(0)` — basta para o PostgREST validar a FORMA do select/embed
// (e devolver erro se for ambíguo), sem precisar de linha nenhuma casando.
const db = adminClient()

describe('SELECT_PAINEL_* — as MESMAS strings de select que getDashboard usa contra o Postgres', () => {
  it('SELECT_PAINEL_PERFIS resolve sem erro contra profiles', async () => {
    const { error } = await db.from('profiles').select(SELECT_PAINEL_PERFIS).limit(0)
    expect(error).toBeNull()
  })

  it('SELECT_PAINEL_CURSOS resolve sem erro contra courses', async () => {
    const { error } = await db.from('courses').select(SELECT_PAINEL_CURSOS).limit(0)
    expect(error).toBeNull()
  })

  it('SELECT_PAINEL_LIBERACOES resolve sem erro contra course_access', async () => {
    const { error } = await db.from('course_access').select(SELECT_PAINEL_LIBERACOES).limit(0)
    expect(error).toBeNull()
  })

  it('SELECT_PAINEL_PROGRESSO resolve sem erro contra lesson_progress', async () => {
    const { error } = await db.from('lesson_progress').select(SELECT_PAINEL_PROGRESSO).limit(0)
    expect(error).toBeNull()
  })
})
