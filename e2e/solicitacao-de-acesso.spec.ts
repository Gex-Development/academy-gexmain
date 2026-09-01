import { expect, test, type Page } from '@playwright/test'
import { adminClient, criarAreaDeTeste, criarUsuarioDeTeste } from './helpers'

const SENHA = 'senha-de-teste-123'

// Mesmo timeout de e2e/acesso-bloqueado.spec.ts, pelo mesmo motivo (ver o
// comentário lá): sem um limite próprio no clique, uma ação travada só é
// cortada pelo timeout global do teste (60s), e o `finally` que chama
// limpar() não tem garantia de terminar antes do worker ser encerrado — foi
// assim que fixtures ficaram presos no banco antes.
const TIMEOUT_CLIQUE = 15000

async function entrar(page: Page, email: string) {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(SENHA)
  await page.getByRole('button', { name: 'Entrar' }).click({ timeout: TIMEOUT_CLIQUE })
  await expect(page).toHaveURL('/')
}

async function sair(page: Page) {
  await page.getByRole('button', { name: 'Sair' }).click({ timeout: TIMEOUT_CLIQUE })
  await expect(page).toHaveURL(/\/login/)
}

/**
 * Fixtures de banco criados por este teste, para apagar no fim.
 * Mesma ordem de e2e/acesso-bloqueado.spec.ts (criarFixtures/limpar): cursos
 * antes de áreas (`courses.area_id` é ON DELETE RESTRICT, e `courses.owner_id`
 * também restringe contra o próprio líder), usuários por último (apagar
 * `auth.users` derruba o perfil em cascata). `access_requests` e
 * `course_access` não entram aqui: as duas tabelas cascateiam do curso (e
 * também do usuário), então somem junto quando o curso é apagado.
 */
interface Fixtures {
  cursos: string[]
  areas: string[]
  usuarios: string[]
}

function criarFixtures(): Fixtures {
  return { cursos: [], areas: [], usuarios: [] }
}

/**
 * Apaga os fixtures e agrega qualquer falha num erro só. Sem isso, uma
 * suíte verde não prova que a limpeza aconteceu — ela só prova que os
 * `expect()` do teste passaram antes da limpeza silenciosamente falhar.
 */
async function limpar(fixtures: Fixtures) {
  const db = adminClient()
  const falhas: string[] = []

  for (const id of fixtures.cursos) {
    const { error } = await db.from('courses').delete().eq('id', id)
    if (error) falhas.push(`curso ${id}: ${error.message}`)
  }
  for (const id of fixtures.areas) {
    const { error } = await db.from('areas').delete().eq('id', id)
    if (error) falhas.push(`área ${id}: ${error.message}`)
  }
  for (const id of fixtures.usuarios) {
    const { error } = await db.auth.admin.deleteUser(id)
    if (error) falhas.push(`usuário ${id}: ${error.message}`)
  }

  if (falhas.length > 0) {
    throw new Error(`limpar: falha ao remover ${falhas.length} fixture(s):\n${falhas.join('\n')}`)
  }
}

test('colaborador pede acesso, admin aprova e o curso destrava', async ({ page }) => {
  const db = adminClient()
  const stamp = Date.now()
  const fixtures = criarFixtures()

  try {
    const areaCopy = await criarAreaDeTeste('Copyyy')
    fixtures.areas.push(areaCopy)
    const areaDesign = await criarAreaDeTeste('Designnn')
    fixtures.areas.push(areaDesign)

    const liderId = await criarUsuarioDeTeste({
      email: `lider-s-${stamp}@gexcorp.com.br`,
      senha: SENHA,
      fullName: 'Líder Copy',
      role: 'leader',
      areaId: areaCopy,
    })
    fixtures.usuarios.push(liderId)

    const emailAdmin = `admin-s-${stamp}@gexcorp.com.br`
    const emailDesigner = `designer-s-${stamp}@gexcorp.com.br`

    const adminId = await criarUsuarioDeTeste({
      email: emailAdmin,
      senha: SENHA,
      fullName: 'Admin Geral',
      role: 'admin',
    })
    fixtures.usuarios.push(adminId)

    const designerId = await criarUsuarioDeTeste({
      email: emailDesigner,
      senha: SENHA,
      fullName: 'Dani Designer',
      role: 'member',
      areaId: areaDesign,
    })
    fixtures.usuarios.push(designerId)

    const slugCurso = `copy-persuasiva-${stamp}`
    const { data: curso, error: cursoError } = await db
      .from('courses')
      .insert({
        title: 'Copy Persuasiva',
        slug: slugCurso,
        description: 'Fundamentos de escrita para vendas.',
        area_id: areaCopy,
        owner_id: liderId,
        status: 'published',
      })
      .select('id')
      .single()
    if (cursoError || !curso) throw cursoError ?? new Error('curso não criado')
    fixtures.cursos.push(curso.id)

    const { error: aulaError } = await db.from('lessons').insert({
      course_id: curso.id,
      title: 'Gatilhos mentais',
      slug: 'gatilhos',
      video_provider: 'youtube',
      video_ref: 'dQw4w9WgXcQ',
      status: 'published',
    })
    if (aulaError) throw aulaError

    // A designer encontra o cadeado e pede acesso.
    await entrar(page, emailDesigner)
    await page.goto(`/curso/${slugCurso}`)
    await expect(page.getByText('Você ainda não tem acesso a este curso.')).toBeVisible()

    await page
      .getByPlaceholder('Por que você precisa deste curso? (opcional)')
      .fill('Vou escrever as legendas dos criativos.')
    await page.getByRole('button', { name: 'Solicitar acesso' }).click({ timeout: TIMEOUT_CLIQUE })
    await expect(page.getByText('Solicitação enviada.')).toBeVisible()

    await sair(page)

    // O admin aprova.
    await entrar(page, emailAdmin)
    await page.goto('/admin/solicitacoes')
    await expect(page.getByText('Dani Designer → Copy Persuasiva')).toBeVisible()
    await expect(page.getByText('Vou escrever as legendas dos criativos.')).toBeVisible()
    await page.getByRole('button', { name: 'Aprovar' }).click({ timeout: TIMEOUT_CLIQUE })
    await expect(page.getByText('Nenhuma solicitação pendente.')).toBeVisible()

    await sair(page)

    // A designer agora entra no curso.
    await entrar(page, emailDesigner)
    await page.goto(`/curso/${slugCurso}`)
    await expect(page.getByText('Gatilhos mentais')).toBeVisible()
    await expect(page.getByText('Você ainda não tem acesso a este curso.')).toHaveCount(0)
  } finally {
    await limpar(fixtures)
  }
})
