#!/usr/bin/env node
import { spawnSync } from 'node:child_process'

// Node 20.12+ lê o arquivo de ambiente nativamente.
process.loadEnvFile('.env.local')

const ref = process.env.SUPABASE_PROJECT_REF
const senha = process.env.SUPABASE_DB_PASSWORD

if (!ref || !senha) {
  console.error(
    'Faltam SUPABASE_PROJECT_REF e/ou SUPABASE_DB_PASSWORD no .env.local.\n' +
      'Eles estão no painel do Supabase, em Project Settings → Database.',
  )
  process.exit(1)
}

// encodeURIComponent é obrigatório: senhas do Supabase costumam ter !, * e @,
// que quebram a connection string se entrarem cruas.
const dbUrl = `postgresql://postgres:${encodeURIComponent(senha)}@db.${ref}.supabase.co:5432/postgres`

const { status } = spawnSync('npx', ['supabase', ...process.argv.slice(2), '--db-url', dbUrl], {
  stdio: 'inherit',
})

process.exit(status ?? 1)
