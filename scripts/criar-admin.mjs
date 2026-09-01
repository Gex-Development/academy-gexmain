#!/usr/bin/env node
/**
 * Cria o PRIMEIRO administrador da plataforma.
 *
 * Existe porque a GEX Academy é fechada por convite: todo mundo entra porque um
 * admin o convidou. Isso deixa um problema de partida — não há quem convide o
 * primeiro. Este script resolve isso uma vez, usando a service_role.
 *
 * Uso:
 *   node scripts/criar-admin.mjs "email@empresa.com.br" "Nome Completo"
 *
 * A senha é gerada aleatoriamente e impressa uma única vez. Troque-a no perfil
 * depois de entrar.
 */
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'

process.loadEnvFile('.env.local')

const [email, nome] = process.argv.slice(2)

if (!email || !nome) {
  console.error('Uso: node scripts/criar-admin.mjs "email@empresa.com.br" "Nome Completo"')
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !chave) {
  console.error('Faltam NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no .env.local.')
  process.exit(1)
}

const db = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } })

// Base64url de 18 bytes: 24 caracteres, bem acima do mínimo de 8 que a tela exige.
const senha = randomBytes(18).toString('base64url')

const { data, error } = await db.auth.admin.createUser({
  email,
  password: senha,
  email_confirm: true,
})

if (error) {
  console.error(`Não foi possível criar o usuário: ${error.message}`)
  process.exit(1)
}

const { error: erroPerfil } = await db.from('profiles').insert({
  id: data.user.id,
  full_name: nome,
  email,
  role: 'admin',
  status: 'active',
  area_id: null,
})

if (erroPerfil) {
  // Sem perfil o usuário não consegue fazer nada e o e-mail fica ocupado.
  await db.auth.admin.deleteUser(data.user.id)
  console.error(`Não foi possível criar o perfil: ${erroPerfil.message}`)
  process.exit(1)
}

console.log(`\nAdministrador criado.\n`)
console.log(`  E-mail: ${email}`)
console.log(`  Senha:  ${senha}\n`)
console.log(`Entre em ${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/login`)
console.log(`e troque a senha em /perfil.\n`)
