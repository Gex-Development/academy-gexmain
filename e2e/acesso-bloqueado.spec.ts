import { expect, test, type Page } from '@playwright/test'
import { adminClient, criarAreaDeTeste, criarUsuarioDeTeste } from './helpers'

const SENHA = 'senha-de-teste-123'

// Timeout explícito em todo clique deste arquivo: sem ele, a ação de clique
// não tem limite próprio e só é interrompida pelo timeout global do teste
// (60s, ver playwright.config.ts). Quando isso acontece, o `finally` que
// chama limpar() não tem garantia de rodar até o fim antes do worker ser
// encerrado — foi exatamente o que deixou fixtures presos no banco durante a
// checagem de mutação documentada no relatório desta tarefa. Com um timeout
// de ação bem abaixo do limite global, o mesmo clique falha como um erro
// comum de asserção, com folga de sobra para o `finally` terminar.
const TIMEOUT_CLIQUE = 15000

async function entrar(page: Page, email: string) {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(SENHA)
  await page.getByRole('button', { name: 'Entrar' }).click({ timeout: TIMEOUT_CLIQUE })
  await expect(page).toHaveURL('/')
}

/**
 * Fixtures de banco criados por um teste deste arquivo, para apagar no fim.
 * Mesma ordem de tests/db/client.ts (criarLixeira), pela mesma razão: cursos
 * antes de áreas (`courses.area_id` é ON DELETE RESTRICT, e `courses.owner_id`
 * também restringe contra o próprio líder), usuários por último (apagar
 * `auth.users` derruba o perfil em cascata). criarLixeira() não cobre os
 * fixtures de E2E (só os da suíte tests/db) — por isso a mesma lógica é
 * repetida aqui, e não importada de lá.
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

test('colaborador de outra área vê a capa, mas não alcança o conteúdo', async ({ page }) => {
  const db = adminClient()
  const stamp = Date.now()
  const fixtures = criarFixtures()

  try {
    const areaTrafego = await criarAreaDeTeste('Trafego')
    fixtures.areas.push(areaTrafego)
    // A capa do curso não mora mais na home (Tasks 3-4 da fase 4 trocaram a
    // home por uma vitrine de ÁREAS) — é preciso o slug da área para navegar
    // até /area/<slug>, onde o card do curso está agora.
    const { data: areaTrafegoRow, error: areaTrafegoError } = await db
      .from('areas')
      .select('slug')
      .eq('id', areaTrafego)
      .single()
    if (areaTrafegoError || !areaTrafegoRow) throw areaTrafegoError ?? new Error('área não encontrada')
    const areaDesign = await criarAreaDeTeste('Designn')
    fixtures.areas.push(areaDesign)

    const liderId = await criarUsuarioDeTeste({
      email: `lider-b-${stamp}@gexcorp.com.br`,
      senha: SENHA,
      fullName: 'Líder Tráfego',
      role: 'leader',
      areaId: areaTrafego,
    })
    fixtures.usuarios.push(liderId)

    const emailDesigner = `designer-b-${stamp}@gexcorp.com.br`
    const designerId = await criarUsuarioDeTeste({
      email: emailDesigner,
      senha: SENHA,
      fullName: 'Designer Curioso',
      role: 'member',
      areaId: areaDesign,
    })
    fixtures.usuarios.push(designerId)

    // O carimbo entra no título (não só no slug): com ele a capa da vitrine
    // é localizável por um seletor único mesmo que uma execução anterior
    // tenha deixado lixo com o mesmo nome para trás.
    const tituloCurso = `Escala de Campanhas ${stamp}`
    const slugCurso = `escala-de-campanhas-${stamp}`
    const { data: curso, error: cursoError } = await db
      .from('courses')
      .insert({
        title: tituloCurso,
        slug: slugCurso,
        description: 'Como escalar sem quebrar o ROI.',
        area_id: areaTrafego,
        owner_id: liderId,
        status: 'published',
      })
      .select('id')
      .single()
    if (cursoError || !curso) throw cursoError ?? new Error('curso não criado')
    fixtures.cursos.push(curso.id)

    const tituloAula = 'Orçamento por conjunto'
    const { error: aulaError } = await db.from('lessons').insert({
      course_id: curso.id,
      title: tituloAula,
      slug: 'orcamento',
      video_provider: 'youtube',
      video_ref: 'dQw4w9WgXcQ',
      status: 'published',
    })
    if (aulaError) throw aulaError

    await entrar(page, emailDesigner)

    // A home mostra a vitrine de ÁREAS: a capa de Trafego aparece bloqueada
    // para quem é de Design (nenhum curso dela é acessível), e continua
    // clicável — a pessoa entra, vê o que existe e pode pedir acesso. É
    // dentro de /area/<slug> que o card do curso mora agora.
    await page.locator(`a[href="/area/${areaTrafegoRow.slug}"]`).click({ timeout: TIMEOUT_CLIQUE })
    await expect(page).toHaveURL(`/area/${areaTrafegoRow.slug}`)

    // A vitrine mostra a capa do curso de outra área inteira: título, cadeado
    // e contagem de aulas — só o conteúdo (lista de aulas) é que fica de fora.
    // O cadeado é um <span> "sr-only": está no DOM e tem texto, mas não ocupa
    // espaço visível — por isso toBeAttached(), não toBeVisible().
    const card = page.locator('li').filter({ hasText: tituloCurso })
    await expect(card.getByText(tituloCurso)).toBeVisible()
    await expect(card.getByText('Curso bloqueado')).toBeAttached()
    await expect(card.getByText('1 aula')).toBeVisible()

    // A página do curso mostra a descrição e a recusa, mas nenhum título de aula.
    await page.goto(`/curso/${slugCurso}`)
    await expect(page.getByText('Como escalar sem quebrar o ROI.')).toBeVisible()
    await expect(page.getByText('Você ainda não tem acesso a este curso.')).toBeVisible()
    await expect(page.getByText(tituloAula)).toHaveCount(0)

    // A URL direta da aula também não alcança o conteúdo: cai no 404 da
    // aplicação (getLessonView devolve null tanto para aula bloqueada quanto
    // para aula inexistente — de propósito, para não diferenciar os dois
    // casos para quem está do lado de fora).
    await page.goto(`/curso/${slugCurso}/aula/orcamento`)
    await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible()
    await expect(page.getByText(tituloAula)).toHaveCount(0)
  } finally {
    await limpar(fixtures)
  }
})

test('colaborador da área abre o curso e a aula normalmente', async ({ page }) => {
  const db = adminClient()
  const stamp = Date.now()
  const fixtures = criarFixtures()

  try {
    const areaCopy = await criarAreaDeTeste('Copyy')
    fixtures.areas.push(areaCopy)
    // Mesmo motivo do teste acima: o slug é o que leva até /area/<slug>,
    // onde o card do curso está agora.
    const { data: areaCopyRow, error: areaCopyError } = await db
      .from('areas')
      .select('slug')
      .eq('id', areaCopy)
      .single()
    if (areaCopyError || !areaCopyRow) throw areaCopyError ?? new Error('área não encontrada')

    const liderId = await criarUsuarioDeTeste({
      email: `lider-c-${stamp}@gexcorp.com.br`,
      senha: SENHA,
      fullName: 'Líder Copy',
      role: 'leader',
      areaId: areaCopy,
    })
    fixtures.usuarios.push(liderId)

    const emailAluno = `redator-${stamp}@gexcorp.com.br`
    const alunoId = await criarUsuarioDeTeste({
      email: emailAluno,
      senha: SENHA,
      fullName: 'Redator Junior',
      role: 'member',
      areaId: areaCopy,
    })
    fixtures.usuarios.push(alunoId)

    const tituloCurso = `Headlines que Convertem ${stamp}`
    const slugCurso = `headlines-${stamp}`
    const { data: curso, error: cursoError } = await db
      .from('courses')
      .insert({
        title: tituloCurso,
        slug: slugCurso,
        area_id: areaCopy,
        owner_id: liderId,
        status: 'published',
      })
      .select('id')
      .single()
    if (cursoError || !curso) throw cursoError ?? new Error('curso não criado')
    fixtures.cursos.push(curso.id)

    const tituloAula = 'Anatomia de uma headline'
    const { error: aulaError } = await db.from('lessons').insert({
      course_id: curso.id,
      title: tituloAula,
      slug: 'anatomia',
      video_provider: 'youtube',
      video_ref: 'dQw4w9WgXcQ',
      status: 'published',
    })
    if (aulaError) throw aulaError

    await entrar(page, emailAluno)

    // A home mostra a capa da PRÓPRIA área do redator, sem marca de bloqueio
    // — é dentro de /area/<slug> que o card do curso mora agora.
    await page.locator(`a[href="/area/${areaCopyRow.slug}"]`).click({ timeout: TIMEOUT_CLIQUE })
    await expect(page).toHaveURL(`/area/${areaCopyRow.slug}`)

    // Controle do teste acima: mesmo formato de curso (própria área, mesma
    // contagem de uma aula publicada), mas desta vez a pessoa TEM acesso —
    // sem este teste, uma política que bloqueasse todo mundo passaria pelas
    // mesmas asserções de "conteúdo não vaza".
    await page.getByText(tituloCurso).click({ timeout: TIMEOUT_CLIQUE })
    await expect(page.getByRole('heading', { name: tituloCurso })).toBeVisible()

    // Afirma a lista de aulas explicitamente (não só de forma implícita,
    // pelo wait de "clicável" do clique logo abaixo) — é ela, não só o
    // player, que prova que o curso abriu de verdade e não caiu na tela de
    // bloqueio (que também tem <h1> com o título do curso, só que sem
    // nenhuma aula listada).
    await expect(page.getByText(tituloAula)).toBeVisible()
    await page.getByText(tituloAula).click({ timeout: TIMEOUT_CLIQUE })
    await expect(page.getByRole('heading', { name: tituloAula })).toBeVisible()
    await expect(page.locator('iframe[src*="youtube-nocookie.com"]')).toBeVisible()
  } finally {
    await limpar(fixtures)
  }
})
