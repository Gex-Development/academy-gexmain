// Sem 'use server': não depende de cookies(), para o teste de banco chamar a
// MESMA função que a action usa (mesmo raciocínio de attachments-upload.ts).
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

/**
 * Apaga a conta de vez. Progresso, solicitações e fórum saem em cascata. As
 * quatro referências abaixo são ON DELETE RESTRICT e impediriam a exclusão de
 * quem já criou curso, subiu material ou liberou acesso, por isso passam
 * antes para o herdeiro. Não é uma transação: se deleteUser falhar, a pessoa
 * continua existindo e só perdeu a autoria, o que não tira acesso de ninguém.
 */
export async function excluirConta(
  admin: SupabaseClient<Database>,
  id: string,
  herdeiroId: string,
) {
  const transferencias = await Promise.all([
    admin.from('courses').update({ owner_id: herdeiroId }).eq('owner_id', id),
    admin.from('lesson_attachments').update({ uploaded_by: herdeiroId }).eq('uploaded_by', id),
    admin.from('course_access').update({ granted_by: herdeiroId }).eq('granted_by', id),
    admin.from('area_access').update({ granted_by: herdeiroId }).eq('granted_by', id),
  ])
  for (const { error } of transferencias) {
    if (error) throw error
  }

  // deleteUser não lança em falha de API: devolve { error }.
  const { error } = await admin.auth.admin.deleteUser(id)
  if (error) throw error
}
