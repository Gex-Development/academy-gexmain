#!/usr/bin/env node
/**
 * Apaga os dados que as suítes de teste deixam para trás.
 *
 * Os testes de integração e E2E criam usuários, áreas e cursos reais no projeto
 * Supabase e nunca os removem — por isso todo fixture carrega um carimbo de
 * `Date.now()` no e-mail ou no slug, para nunca colidir entre execuções.
 *
 * Esse mesmo carimbo é o que distingue lixo de dado real aqui. NÃO use o domínio
 * do e-mail como critério: @gexcorp.com.br é o domínio de verdade da empresa, e
 * as fixtures também o usam.
 *
 * Uso:
 *   node scripts/limpar-dados-de-teste.mjs            # só mostra o que apagaria
 *   node scripts/limpar-dados-de-teste.mjs --apagar   # apaga de fato
 */
import { createClient } from '@supabase/supabase-js'

process.loadEnvFile('.env.local')

const apagar = process.argv.includes('--apagar')

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

// 13 dígitos é o tamanho de Date.now() por todo este século.
const CARIMBO_EMAIL = /-\d{13}@/
const CARIMBO_SLUG = /-\d{13}$/

function separar(linhas, ehTeste) {
  return {
    teste: linhas.filter(ehTeste),
    real: linhas.filter((l) => !ehTeste(l)),
  }
}

const { data: perfis } = await db.from('profiles').select('id, full_name, email, role, status')
const { data: areas } = await db.from('areas').select('id, name, slug')
const { data: cursos } = await db.from('courses').select('id, title, slug, area_id')

const p = separar(perfis ?? [], (x) => CARIMBO_EMAIL.test(x.email))
const a = separar(areas ?? [], (x) => CARIMBO_SLUG.test(x.slug))
const idsAreasTeste = new Set(a.teste.map((x) => x.id))
// Um curso é lixo se o slug tem carimbo OU se mora numa área que vai sumir —
// courses.area_id é ON DELETE RESTRICT, então ele bloquearia a exclusão da área.
const c = separar(
  cursos ?? [],
  (x) => CARIMBO_SLUG.test(x.slug) || idsAreasTeste.has(x.area_id),
)

console.log(`\n${apagar ? 'APAGANDO' : 'SIMULAÇÃO (nada será apagado)'}\n`)

console.log(`Perfis de teste: ${p.teste.length}`)
console.log(`Áreas de teste:  ${a.teste.length}`)
console.log(`Cursos de teste: ${c.teste.length}`)

console.log(`\n--- PRESERVADO (dado real) ---`)
for (const x of p.real) console.log(`  perfil  ${x.status}/${x.role}  ${x.full_name} <${x.email}>`)
for (const x of a.real) console.log(`  área    ${x.name} (/${x.slug})`)
for (const x of c.real) console.log(`  curso   ${x.title} (/${x.slug})`)

if (!apagar) {
  console.log(`\nRode com --apagar para executar.\n`)
  process.exit(0)
}

// Ordem obrigatória: cursos antes das áreas (RESTRICT), e usuários por último —
// apagar auth.users derruba o perfil em cascata.
let falhas = 0

for (const curso of c.teste) {
  const { error } = await db.from('courses').delete().eq('id', curso.id)
  if (error) { console.error(`  curso ${curso.slug}: ${error.message}`); falhas++ }
}
console.log(`\nCursos apagados: ${c.teste.length - falhas}`)

let falhasArea = 0
for (const area of a.teste) {
  const { error } = await db.from('areas').delete().eq('id', area.id)
  if (error) { console.error(`  área ${area.slug}: ${error.message}`); falhasArea++ }
}
console.log(`Áreas apagadas:  ${a.teste.length - falhasArea}`)

let falhasPerfil = 0
for (const perfil of p.teste) {
  const { error } = await db.auth.admin.deleteUser(perfil.id)
  if (error) { console.error(`  perfil ${perfil.email}: ${error.message}`); falhasPerfil++ }
}
console.log(`Perfis apagados: ${p.teste.length - falhasPerfil}\n`)

process.exit(falhas + falhasArea + falhasPerfil > 0 ? 1 : 0)
