import { expect, test, type Page } from '@playwright/test'
import { CHAVE_TEMA } from '../src/lib/tema/tema'
import { adminClient, criarUsuarioDeTeste } from './helpers'

/**
 * Captura as telas do aluno nos dois temas, em desktop e celular, para
 * conferência visual a cada etapa do redesenho. Não é teste de regressão —
 * só roda quando pedido:
 *
 *   CAPTURAS=1 npx playwright test e2e/capturas.spec.ts
 *
 * Usa os dados REAIS (áreas, cursos e aulas que existem no banco), vistos por
 * um admin temporário criado sem e-mail (createUser) e apagado no fim.
 */
test.skip(!process.env.CAPTURAS, 'só roda com CAPTURAS=1')

const SENHA = 'senha-de-teste-123'
const TAMANHOS = [
  { nome: 'desktop', width: 1440, height: 900 },
  { nome: 'celular', width: 390, height: 844 },
] as const
const TEMAS = ['dark', 'light'] as const

async function capturar(page: Page, rota: string, nome: string) {
  for (const tema of TEMAS) {
    for (const t of TAMANHOS) {
      await page.addInitScript(
        ([chave, valor]) => localStorage.setItem(chave, valor),
        [CHAVE_TEMA, tema] as const,
      )
      await page.setViewportSize({ width: t.width, height: t.height })
      await page.goto(rota)
      await page.waitForLoadState('networkidle')
      // Review Focus 5: nenhuma tela pode rolar para o lado no celular.
      const vaza = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
      expect(vaza, `${nome} (${tema}, ${t.nome}) rola na horizontal`).toBe(false)
      await page.screenshot({ path: `test-results/capturas/${nome}-${tema}-${t.nome}.png`, fullPage: true })
    }
  }
}

test('capturas das telas do aluno', async ({ page }) => {
  test.setTimeout(240000)
  const db = adminClient()
  const stamp = Date.now()
  const email = `capturas-${stamp}@gexcorp.com.br`
  const userId = await criarUsuarioDeTeste({ email, senha: SENHA, fullName: 'Capturas Redesenho', role: 'admin' })

  try {
    const { data: aula } = await db
      .from('lessons')
      .select('slug, courses!inner(slug, status, areas!inner(slug))')
      .eq('status', 'published')
      .eq('courses.status', 'published')
      .limit(1)
      .single()
    if (!aula) throw new Error('nenhuma aula publicada no banco para capturar')
    const curso = aula.courses as unknown as { slug: string; areas: { slug: string } }

    await page.goto('/login')
    await page.getByLabel('E-mail').fill(email)
    await page.getByLabel('Senha').fill(SENHA)
    await page.getByRole('button', { name: 'Entrar' }).click({ timeout: 15000 })
    await expect(page).toHaveURL('/')

    await capturar(page, '/', 'inicio')
    await capturar(page, '/?filtro=continuar', 'inicio-filtro')
    await capturar(page, `/area/${curso.areas.slug}`, 'area')
    await capturar(page, `/curso/${curso.slug}`, 'curso')
    await capturar(page, `/curso/${curso.slug}/aula/${aula.slug}`, 'aula')
  } finally {
    await db.auth.admin.deleteUser(userId)
  }
})
