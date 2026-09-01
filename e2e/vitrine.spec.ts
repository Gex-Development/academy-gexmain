import { expect, test, type Locator, type Page } from '@playwright/test'
import { adminClient, criarAreaDeTeste, criarUsuarioDeTeste } from './helpers'

const SENHA = 'senha-de-teste-123'

// Mesmo timeout de e2e/acesso-bloqueado.spec.ts, pelo mesmo motivo (ver o
// comentário lá): sem um limite próprio no clique, uma ação travada só é
// cortada pelo timeout global do teste (60s, ver playwright.config.ts), e o
// `finally` que chama limpar() não tem garantia de terminar antes do worker
// ser encerrado — foi assim que fixtures ficaram presos no banco antes.
const TIMEOUT_CLIQUE = 15000

async function entrar(page: Page, email: string) {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(SENHA)
  await page.getByRole('button', { name: 'Entrar' }).click({ timeout: TIMEOUT_CLIQUE })
  await expect(page).toHaveURL('/')
}

/**
 * Contraste WCAG entre duas cores no formato que getComputedStyle devolve
 * ("rgb(r, g, b)" ou "rgba(r, g, b, a)") — luminância relativa e razão de
 * contraste, fórmula da WCAG 2.x (mesma que a política de acessibilidade do
 * projeto usa como critério: mínimo 4,5:1). Sem depender de biblioteca
 * nenhuma: são poucas linhas, e o objetivo deste teste é justamente não
 * confiar em leitura visual — foi assim que o Item 1 (botão primário a
 * 1,88:1 no escuro) atravessou 268 testes unitários, 139 de banco, 4 specs
 * de E2E e uma conferência visual à mão.
 */
function paraLinear(canal8bit: number): number {
  const c = canal8bit / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function luminanciaRelativa(corRgb: string): number {
  const [r, g, b] = corRgb.match(/\d+(\.\d+)?/g)!.map(Number)
  return 0.2126 * paraLinear(r) + 0.7152 * paraLinear(g) + 0.0722 * paraLinear(b)
}

function contraste(corA: string, corB: string): number {
  const clara = Math.max(luminanciaRelativa(corA), luminanciaRelativa(corB))
  const escura = Math.min(luminanciaRelativa(corA), luminanciaRelativa(corB))
  return (clara + 0.05) / (escura + 0.05)
}

/**
 * Fixtures de banco criados por este teste, para apagar no fim. Mesma ordem
 * de e2e/acesso-bloqueado.spec.ts (criarFixtures/limpar): cursos antes de
 * áreas (`courses.area_id` é ON DELETE RESTRICT, e `courses.owner_id`
 * também restringe contra o próprio líder), usuários por último (apagar
 * `auth.users` derruba o perfil em cascata). criarLixeira() (tests/db) não
 * cobre fixtures de E2E — por isso a mesma lógica é repetida aqui.
 */
interface Fixtures {
  cursos: string[]
  areas: string[]
  usuarios: string[]
}

function criarFixtures(): Fixtures {
  return { cursos: [], areas: [], usuarios: [] }
}

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

test('vitrine: home mostra as duas capas, área liberada abre o curso, área bloqueada não é beco sem saída', async ({
  page,
}) => {
  const db = adminClient()
  const stamp = Date.now()
  const fixtures = criarFixtures()

  try {
    // Duas áreas: a primeira ganha cover_url (criarAreaDeTeste não aceita o
    // campo — é escrito à parte, direto no banco, como updateArea faria), a
    // segunda fica sem capa, para exercitar o retângulo de cor sólida.
    // Nome sem espaço de propósito, mesmo depois de criarAreaDeTeste passar a
    // slugificar (e2e/helpers.ts): a primeira execução deste spec, quando
    // ainda montava o slug com `${nome.toLowerCase()}-${Date.now()}` sem
    // slugificar, caiu em 404 com "Vitrine Minha" (nome com espaço vira slug
    // com espaço, que quebra o casamento de rota de /area/[slug]). Toda área
    // de teste existente na suíte (Trafego, Designn, Copyy) já segue essa
    // mesma convenção de nome único sem espaço.
    const nomeAreaMinha = `VitrineMinha${stamp}`
    const areaMinhaId = await criarAreaDeTeste(nomeAreaMinha)
    fixtures.areas.push(areaMinhaId)
    const urlCapa = 'https://picsum.photos/seed/gex-vitrine-e2e/1600/1000'
    const { data: areaMinha, error: capaError } = await db
      .from('areas')
      .update({ cover_url: urlCapa })
      .eq('id', areaMinhaId)
      .select('slug')
      .single()
    if (capaError || !areaMinha) throw capaError ?? new Error('capa da área não gravada')

    const nomeAreaOutra = `VitrineOutra${stamp}`
    const areaOutraId = await criarAreaDeTeste(nomeAreaOutra)
    fixtures.areas.push(areaOutraId)
    const { data: areaOutra, error: areaOutraError } = await db
      .from('areas')
      .select('slug')
      .eq('id', areaOutraId)
      .single()
    if (areaOutraError || !areaOutra) throw areaOutraError ?? new Error('área não encontrada')

    const liderMinhaId = await criarUsuarioDeTeste({
      email: `lider-vitrine-minha-${stamp}@gexcorp.com.br`,
      senha: SENHA,
      fullName: 'Líder Vitrine Minha',
      role: 'leader',
      areaId: areaMinhaId,
    })
    fixtures.usuarios.push(liderMinhaId)

    const liderOutraId = await criarUsuarioDeTeste({
      email: `lider-vitrine-outra-${stamp}@gexcorp.com.br`,
      senha: SENHA,
      fullName: 'Líder Vitrine Outra',
      role: 'leader',
      areaId: areaOutraId,
    })
    fixtures.usuarios.push(liderOutraId)

    const emailColaborador = `colaborador-vitrine-${stamp}@gexcorp.com.br`
    const colaboradorId = await criarUsuarioDeTeste({
      email: emailColaborador,
      senha: SENHA,
      fullName: 'Colaborador Vitrine',
      role: 'member',
      areaId: areaMinhaId,
    })
    fixtures.usuarios.push(colaboradorId)

    const tituloCursoMinha = `Curso Vitrine Minha ${stamp}`
    const slugCursoMinha = `curso-vitrine-minha-${stamp}`
    const { data: cursoMinha, error: cursoMinhaError } = await db
      .from('courses')
      .insert({
        title: tituloCursoMinha,
        slug: slugCursoMinha,
        area_id: areaMinhaId,
        owner_id: liderMinhaId,
        status: 'published',
      })
      .select('id')
      .single()
    if (cursoMinhaError || !cursoMinha) throw cursoMinhaError ?? new Error('curso não criado')
    fixtures.cursos.push(cursoMinha.id)

    const tituloAulaMinha = 'Aula Vitrine Minha'
    const { error: aulaMinhaError } = await db.from('lessons').insert({
      course_id: cursoMinha.id,
      title: tituloAulaMinha,
      slug: 'aula-minha',
      video_provider: 'youtube',
      video_ref: 'dQw4w9WgXcQ',
      status: 'published',
    })
    if (aulaMinhaError) throw aulaMinhaError

    const tituloCursoOutra = `Curso Vitrine Outra ${stamp}`
    const slugCursoOutra = `curso-vitrine-outra-${stamp}`
    const { data: cursoOutra, error: cursoOutraError } = await db
      .from('courses')
      .insert({
        title: tituloCursoOutra,
        slug: slugCursoOutra,
        area_id: areaOutraId,
        owner_id: liderOutraId,
        status: 'published',
      })
      .select('id')
      .single()
    if (cursoOutraError || !cursoOutra) throw cursoOutraError ?? new Error('curso não criado')
    fixtures.cursos.push(cursoOutra.id)

    const { error: aulaOutraError } = await db.from('lessons').insert({
      course_id: cursoOutra.id,
      title: 'Aula Vitrine Outra',
      slug: 'aula-outra',
      video_provider: 'youtube',
      video_ref: 'dQw4w9WgXcQ',
      status: 'published',
    })
    if (aulaOutraError) throw aulaOutraError

    await entrar(page, emailColaborador)

    // Home: a capa da própria área aparece com a imagem configurada e sem
    // marca de bloqueio; a capa da outra área aparece com "sem acesso" — mas
    // as duas continuam na grade (nenhuma some por falta de acesso).
    const capaMinha = page.locator('li').filter({ hasText: nomeAreaMinha })
    await expect(capaMinha.getByText(nomeAreaMinha)).toBeVisible()
    await expect(capaMinha.locator('img')).toHaveAttribute('src', urlCapa)
    await expect(capaMinha.getByText('sem acesso')).toHaveCount(0)

    const capaOutra = page.locator('li').filter({ hasText: nomeAreaOutra })
    await expect(capaOutra.getByText(nomeAreaOutra)).toBeVisible()
    await expect(capaOutra.getByText('sem acesso')).toBeVisible()

    // Clique na capa da própria área: leva para /area/<slug> e mostra o
    // curso daquela área na grade "Todos os cursos".
    await capaMinha.getByRole('link').click({ timeout: TIMEOUT_CLIQUE })
    await expect(page).toHaveURL(`/area/${areaMinha.slug}`)
    await expect(page.getByRole('heading', { name: tituloCursoMinha })).toBeVisible()

    // Clique no curso: a página do curso abre de verdade (não a tela de
    // bloqueio, que também tem <h1> com o título — por isso a aula listada,
    // ausente na tela de bloqueio, é quem prova o acesso de fato).
    await page
      .locator('li')
      .filter({ hasText: tituloCursoMinha })
      .getByRole('link')
      .click({ timeout: TIMEOUT_CLIQUE })
    await expect(page).toHaveURL(`/curso/${slugCursoMinha}`)
    await expect(page.getByRole('heading', { name: tituloCursoMinha })).toBeVisible()
    await expect(page.getByText(tituloAulaMinha)).toBeVisible()

    // Volta para a home e clica na área bloqueada: a página abre — não é um
    // beco sem saída — e mostra o curso dela com cadeado.
    await page.goto('/')
    await page
      .locator('li')
      .filter({ hasText: nomeAreaOutra })
      .getByRole('link')
      .click({ timeout: TIMEOUT_CLIQUE })
    await expect(page).toHaveURL(`/area/${areaOutra.slug}`)

    const cartaoCursoOutra = page.locator('li').filter({ hasText: tituloCursoOutra })
    await expect(cartaoCursoOutra.getByText(tituloCursoOutra)).toBeVisible()
    await expect(cartaoCursoOutra.getByText('Curso bloqueado')).toBeAttached()
  } finally {
    await limpar(fixtures)
  }
})

/** Lê color/background-color computados de um locator e afirma >= 4,5:1, com a mensagem de erro carregando as duas cores lidas. */
async function esperarContraste(locator: Locator, rotulo: string) {
  const { cor, fundo } = await locator.evaluate((el) => {
    const cs = getComputedStyle(el)
    return { cor: cs.color, fundo: cs.backgroundColor }
  })
  expect(contraste(cor, fundo), `${rotulo}: ${cor} sobre ${fundo}`).toBeGreaterThanOrEqual(4.5)
}

test('tema: botões primário e de perigo passam 4,5:1 de contraste no escuro e no claro', async ({ page }) => {
  const stamp = Date.now()
  const fixtures = criarFixtures()

  try {
    // Um admin cobre os dois botões sem precisar de um segundo usuário:
    // /perfil tem o <Button> padrão (primário, "Salvar" de profile-form.tsx)
    // e /admin/pessoas mostra a própria linha do admin logado com um botão
    // de perigo ("Desativar" — variant="perigo" em person-row.tsx, ver
    // linha 73). setPersonStatus recusa a autodesativação no SERVIDOR
    // ("Você não pode desativar a si mesmo."), mas o botão aparece na tela
    // igual a qualquer outro — não precisamos clicar nele, só ler a cor
    // computada, então a recusa do servidor não entra em jogo aqui.
    const fullName = `Contraste Botões ${stamp}`
    const email = `contraste-botoes-${stamp}@gexcorp.com.br`
    const userId = await criarUsuarioDeTeste({
      email,
      senha: SENHA,
      fullName,
      role: 'admin',
    })
    fixtures.usuarios.push(userId)

    await entrar(page, email)

    await page.goto('/perfil')
    const primario = page.getByRole('button', { name: 'Salvar' })
    await expect(primario).toBeVisible()

    await page.goto('/admin/pessoas')
    // A própria linha do admin, achada pelo fullName (único por causa do
    // carimbo) — dentro dela, e só dentro dela, o botão "Desativar".
    const perigo = page.locator('li').filter({ hasText: fullName }).getByRole('button', { name: 'Desativar' })
    await expect(perigo).toBeVisible()

    // Tema escuro é o padrão da plataforma — sem escolha em localStorage,
    // é o que a pessoa vê ao entrar pela primeira vez.
    await expect(page.locator('html')).toHaveClass(/dark/)
    await esperarContraste(perigo, 'perigo escuro')

    // Alterna pelo botão do topo (ThemeToggle), não manipulando localStorage
    // ou a classe do <html> na mão — é o caminho real de quem usa o produto.
    // O ThemeToggle está em AppShell, presente em /admin/pessoas também.
    await page.getByRole('button', { name: 'Usar tema claro' }).click({ timeout: TIMEOUT_CLIQUE })
    await expect(page.locator('html')).not.toHaveClass(/dark/)
    await esperarContraste(perigo, 'perigo claro')

    // O locator `primario` continua válido depois da navegação — Playwright
    // re-consulta o DOM atual a cada uso, não guarda uma referência presa à
    // página antiga. Volta para /perfil só para o elemento existir de novo.
    await page.goto('/perfil')
    await expect(primario).toBeVisible()
    await esperarContraste(primario, 'primário claro')

    // E o escuro do primário: volta e alterna de novo, para não deixar essa
    // combinação sem cobertura (o primário só tinha sido lido no claro até
    // aqui, e o perigo só no escuro/claro de /admin/pessoas).
    await page.getByRole('button', { name: 'Usar tema escuro' }).click({ timeout: TIMEOUT_CLIQUE })
    await expect(page.locator('html')).toHaveClass(/dark/)
    await esperarContraste(primario, 'primário escuro')
  } finally {
    await limpar(fixtures)
  }
})
