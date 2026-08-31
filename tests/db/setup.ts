import { config } from 'dotenv'

config({ path: '.env.local' })

const required = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(
      `${key} ausente. Preencha o .env.local com as credenciais do projeto Supabase de desenvolvimento antes de rodar "npm run test:db".`,
    )
  }
}
