import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    // Fixo em localhost de propósito — NÃO troque por
    // `process.env.NEXT_PUBLIC_SITE_URL`. O webServer abaixo sempre sobe um
    // servidor local e esta suíte cria usuários com a service_role
    // (e2e/helpers.ts): a Fase 3 aponta NEXT_PUBLIC_SITE_URL para a URL de
    // produção, e se baseURL seguisse essa variável o Playwright subiria um
    // servidor local, esperaria em localhost, e ainda assim rodaria toda a
    // suíte (criação de usuários incluída) contra produção.
    baseURL: 'http://localhost:3000',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120000,
  },
})
