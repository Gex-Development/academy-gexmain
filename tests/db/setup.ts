import { config } from 'dotenv'

// quiet: true só cala a dica informativa de sempre ("injected env (N) from
// .env.local // tip: ..."), suportada desde dotenv 17.0.0 (instalado: ver
// package.json) — não afeta erro nenhum, porque dotenv não loga erro de
// leitura por padrão, só essa dica.
config({ path: '.env.local', quiet: true })

const required = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(
      `${key} ausente. Preencha o .env.local com as credenciais do projeto Supabase de desenvolvimento antes de rodar "npm run test:db".`,
    )
  }
}
