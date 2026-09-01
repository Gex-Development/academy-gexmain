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
 * `auth.users` derruba o perfil em cascata, e só depois de o curso já ter
 * sumido é que o RESTRICT de owner_id deixa de barrar). Perguntas e respostas
 * não entram aqui: `questions`/`answers` cascateiam da aula, que cascateia do
 * curso.
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

test('aluno pergunta, líder responde com selo de professor, aluno conclui a aula', async ({
  page,
}) => {
  const db = adminClient()
  const stamp = Date.now()
  const fixtures = criarFixtures()

  try {
    const area = await criarAreaDeTeste('Trafegoo')
    fixtures.areas.push(area)

    const emailLider = `lider-f-${stamp}@gexcorp.com.br`
    const emailAluno = `aluno-f-${stamp}@gexcorp.com.br`

    const liderId = await criarUsuarioDeTeste({
      email: emailLider,
      senha: SENHA,
      fullName: 'Carlos Líder',
      role: 'leader',
      areaId: area,
    })
    fixtures.usuarios.push(liderId)

    const alunoId = await criarUsuarioDeTeste({
      email: emailAluno,
      senha: SENHA,
      fullName: 'Ana Aluna',
      role: 'member',
      areaId: area,
    })
    fixtures.usuarios.push(alunoId)

    const slugCurso = `campanhas-${stamp}`
    const { data: curso, error: cursoError } = await db
      .from('courses')
      .insert({
        title: 'Campanhas de Performance',
        slug: slugCurso,
        area_id: area,
        owner_id: liderId,
        status: 'published',
      })
      .select('id')
      .single()
    if (cursoError || !curso) throw cursoError ?? new Error('curso não criado')
    fixtures.cursos.push(curso.id)

    const { error: aulaError } = await db.from('lessons').insert({
      course_id: curso.id,
      title: 'Escolhendo o objetivo',
      slug: 'objetivo',
      video_provider: 'youtube',
      video_ref: 'dQw4w9WgXcQ',
      status: 'published',
    })
    if (aulaError) throw aulaError

    // A aluna pergunta e conclui a aula.
    await entrar(page, emailAluno)
    await page.goto(`/curso/${slugCurso}/aula/objetivo`)

    await page
      .getByPlaceholder('Ficou com alguma dúvida nesta aula?')
      .fill('Qual objetivo vocês usam para topo de funil?')
    await page.getByRole('button', { name: 'Enviar dúvida' }).click({ timeout: TIMEOUT_CLIQUE })
    await expect(page.getByText('Qual objetivo vocês usam para topo de funil?')).toBeVisible()

    await page
      .getByRole('button', { name: 'Marcar como concluída' })
      .click({ timeout: TIMEOUT_CLIQUE })
    await expect(page.getByRole('button', { name: '✓ Aula concluída' })).toBeVisible()

    await page.goto(`/curso/${slugCurso}`)
    await expect(page.getByText('1 de 1 aula concluída · 100%')).toBeVisible()

    await sair(page)

    // O líder vê a dúvida na fila e responde.
    await entrar(page, emailLider)
    await page.goto('/gerenciar/duvidas')
    await expect(page.getByText('Qual objetivo vocês usam para topo de funil?')).toBeVisible()
    // exact: true — sem isto, "sem resposta" também casa com o resumo do
    // cabeçalho da página ("1 sem resposta · 0 respondidas…"), e o locator
    // resolve para dois elementos em vez de um (visto rodando o teste).
    await expect(page.getByText('sem resposta', { exact: true })).toBeVisible()

    await page
      .getByRole('link', { name: 'Abrir a aula e responder →' })
      .click({ timeout: TIMEOUT_CLIQUE })
    await page
      .getByPlaceholder('Escreva uma resposta…')
      .fill('Usamos Alcance para topo de funil.')
    await page.getByRole('button', { name: 'Responder' }).click({ timeout: TIMEOUT_CLIQUE })

    await expect(page.getByText('Usamos Alcance para topo de funil.')).toBeVisible()
    await expect(page.getByText('Professor').first()).toBeVisible()
  } finally {
    await limpar(fixtures)
  }
})
