import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

const SENHA_DE_TESTE = 'senha-de-teste-123'

/** Cliente com service_role: ignora RLS. Uso exclusivo de testes e seeds. */
export function adminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

/** Cria um usuário de auth com perfil e devolve o id. */
export async function createTestUser(input: {
  email: string
  fullName: string
  role: 'admin' | 'leader' | 'member'
  areaId?: string | null
  status?: 'invited' | 'active' | 'inactive'
}) {
  const db = adminClient()
  const { data, error } = await db.auth.admin.createUser({
    email: input.email,
    password: SENHA_DE_TESTE,
    email_confirm: true,
  })
  if (error || !data.user) throw error ?? new Error('usuário não criado')

  const { error: profileError } = await db.from('profiles').insert({
    id: data.user.id,
    full_name: input.fullName,
    email: input.email,
    role: input.role,
    area_id: input.areaId ?? null,
    status: input.status ?? 'active',
  })
  if (profileError) throw profileError

  return data.user.id
}

/**
 * Cache de clientes autenticados, por email+senha. Muitos testes reautenticam
 * o mesmo punhado de usuários repetidas vezes; sem isso a suíte estoura o
 * rate limit de auth do Supabase (signInWithPassword). Vive no módulo, então
 * dura o processo do arquivo de teste — cada usuário distinto loga uma vez
 * por arquivo, não uma vez por chamada.
 *
 * Seguro mesmo quando um teste muda o `status` do usuário no meio do arquivo
 * (ativo → inativo): RLS é avaliado a cada consulta contra o estado atual do
 * banco, não fica gravado no JWT — o cliente cacheado continua refletindo a
 * realidade corrente mesmo com a sessão antiga.
 */
const cacheDeClientes = new Map<string, ReturnType<typeof createClient<Database>>>()

/**
 * Cliente autenticado como o usuário de teste indicado, com a chave publicável
 * (não a service_role): é o único jeito de exercitar RLS de verdade — um
 * cliente com service_role ignora as políticas por completo.
 */
export async function authClient(email: string, password = SENHA_DE_TESTE) {
  const chave = `${email}:${password}`
  const emCache = cacheDeClientes.get(chave)
  if (emCache) return emCache

  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw error

  cacheDeClientes.set(chave, client)
  return client
}

/**
 * Acumula os ids criados por um arquivo de teste e os remove no fim.
 *
 * Os testes rodam contra o projeto Supabase de verdade — o mesmo que os líderes
 * usam. Sem isso, cada execução deixa dezenas de usuários e áreas para trás.
 * A ordem de remoção importa: cursos antes de áreas (`courses.area_id` é
 * ON DELETE RESTRICT) e usuários por último (apagar `auth.users` derruba o
 * perfil em cascata).
 *
 * limpar() captura o erro de cada exclusão e lança um erro agregado no final
 * em vez de simplesmente ignorá-lo. Sem isso, uma suíte verde não prova que a
 * limpeza aconteceu: rodando depois de um `db:reset` (sem seed.sql), o admin
 * criado por rls.test.ts é o único admin ativo do banco — apagá-lo no fim
 * dispara `profiles_exige_admin` (GX001), o delete falha, e o fixture
 * sobrevive enquanto a suíte reporta sucesso.
 */
export function criarLixeira() {
  const cursos: string[] = []
  const areas: string[] = []
  const usuarios: string[] = []

  return {
    curso: (id: string) => cursos.push(id),
    area: (id: string) => areas.push(id),
    usuario: (id: string) => usuarios.push(id),
    async limpar() {
      const db = adminClient()
      const falhas: string[] = []

      for (const id of cursos) {
        const { error } = await db.from('courses').delete().eq('id', id)
        if (error) falhas.push(`curso ${id}: ${error.message}`)
      }
      for (const id of areas) {
        const { error } = await db.from('areas').delete().eq('id', id)
        if (error) falhas.push(`área ${id}: ${error.message}`)
      }
      for (const id of usuarios) {
        const { error } = await db.auth.admin.deleteUser(id)
        if (error) falhas.push(`usuário ${id}: ${error.message}`)
      }

      if (falhas.length > 0) {
        throw new Error(`criarLixeira: falha ao limpar ${falhas.length} fixture(s):\n${falhas.join('\n')}`)
      }
    },
  }
}
