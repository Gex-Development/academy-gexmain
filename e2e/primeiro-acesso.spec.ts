import { expect, test } from '@playwright/test'
import { adminClient, criarAreaDeTeste, criarUsuarioDeTeste } from './helpers'

test('colaborador ativo entra e vê a navegação de colaborador', async ({ page }) => {
  const stamp = Date.now()
  const email = `colab-${stamp}@gexcorp.com.br`
  const areaId = await criarAreaDeTeste('Copy')
  await criarUsuarioDeTeste({
    email,
    senha: 'senha-de-teste-123',
    fullName: 'Ana Colaboradora',
    role: 'member',
    areaId,
  })

  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill('senha-de-teste-123')
  await page.getByRole('button', { name: 'Entrar' }).click()

  await expect(page.getByRole('heading', { name: 'Olá, Ana' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Início' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Pessoas' })).toHaveCount(0)
  // 'Cursos' é o RÓTULO do link para /gerenciar. Ele já se chamou
  // 'Gerenciar'; quando o texto mudou, esta linha continuou procurando o
  // nome antigo e passou a valer por vacuidade — passaria mesmo se o link
  // estivesse aparecendo para quem não pode gerenciar. Se o rótulo mudar de
  // novo, esta linha muda junto.
  await expect(page.getByRole('link', { name: 'Cursos' })).toHaveCount(0)
})

test('colaborador abre o próprio perfil e salva o nome', async ({ page }) => {
  const stamp = Date.now()
  const email = `perfil-${stamp}@gexcorp.com.br`
  const areaId = await criarAreaDeTeste('Infraa')
  await criarUsuarioDeTeste({
    email,
    senha: 'senha-de-teste-123',
    fullName: 'Fabio Original',
    role: 'member',
    areaId,
  })

  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill('senha-de-teste-123')
  await page.getByRole('button', { name: 'Entrar' }).click()

  await page.getByRole('link', { name: 'Perfil' }).click()
  await expect(page.getByRole('heading', { name: 'Perfil' })).toBeVisible()

  await page.getByLabel('Nome completo').fill('Fabio Atualizado')
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('Perfil salvo.')).toBeVisible()

  const { data } = await adminClient().from('profiles').select('full_name').eq('email', email).single()
  expect(data!.full_name).toBe('Fabio Atualizado')
})

test('visitante sem sessão é levado ao login', async ({ page }) => {
  await page.goto('/admin/pessoas')
  await expect(page).toHaveURL(/\/login/)
})

test('colaborador comum não abre a área do admin', async ({ page }) => {
  const stamp = Date.now()
  const email = `intruso-${stamp}@gexcorp.com.br`
  const areaId = await criarAreaDeTeste('Design')
  await criarUsuarioDeTeste({
    email,
    senha: 'senha-de-teste-123',
    fullName: 'Bruno Intruso',
    role: 'member',
    areaId,
  })

  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill('senha-de-teste-123')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('heading', { name: 'Olá, Bruno' })).toBeVisible()

  await page.goto('/admin/pessoas')
  await expect(page).toHaveURL('/')
})

test('pessoa desativada vê o aviso e não acessa o conteúdo', async ({ page }) => {
  const stamp = Date.now()
  const email = `desativado-${stamp}@gexcorp.com.br`
  await criarUsuarioDeTeste({
    email,
    senha: 'senha-de-teste-123',
    fullName: 'Carla Desativada',
    role: 'member',
    status: 'inactive',
  })

  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill('senha-de-teste-123')
  await page.getByRole('button', { name: 'Entrar' }).click()

  await expect(page.getByText('Seu acesso à GEX Academy está desativado.')).toBeVisible()
})

test('admin convida pessoa e ela aparece na lista como convite pendente', async ({ page }) => {
  const stamp = Date.now()
  const emailAdmin = `admin-${stamp}@gexcorp.com.br`
  const emailConvidado = `convidado-${stamp}@gexcorp.com.br`
  await criarUsuarioDeTeste({
    email: emailAdmin,
    senha: 'senha-de-teste-123',
    fullName: 'Diego Admin',
    role: 'admin',
  })
  await criarAreaDeTeste('Infra')

  await page.goto('/login')
  await page.getByLabel('E-mail').fill(emailAdmin)
  await page.getByLabel('Senha').fill('senha-de-teste-123')
  await page.getByRole('button', { name: 'Entrar' }).click()
  // Espera o login concluir antes de navegar: sem isto, o goto abaixo corre
  // com o signInWithPassword ainda em voo e cancela a requisição no meio,
  // deixando a sessão sem cookie e a navegação de volta no /login.
  await expect(page.getByRole('heading', { name: 'Olá, Diego' })).toBeVisible()

  await page.goto('/admin/pessoas')

  // Escopado ao painel "Convidar pessoa" (o <aside>, landmark "complementary")
  // por dois motivos: (1) o admin logado (Diego Admin) já aparece na própria
  // lista de pessoas ao lado, e o select de papel/área de cada linha carrega
  // um aria-label "Papel de Diego Admin" / "Área de Diego Admin" — sem
  // escopar, a busca por substring de getByLabel bate nos dois elementos e
  // vira erro de modo estrito; (2) o overlay do Next Dev Tools mantém uma
  // região role="alert" vazia fora deste painel, presente desde o carregamento
  // da página — sem escopar, o "OR" abaixo é satisfeito por ela antes mesmo
  // do convite terminar de ser enviado, e o diagnóstico dispara em falso.
  const painelConvite = page.getByRole('complementary')
  await painelConvite.getByLabel('Nome completo').fill('Eva Convidada')
  await painelConvite.getByLabel('E-mail').fill(emailConvidado)
  await painelConvite.getByLabel('Papel').selectOption('member')
  await painelConvite.getByLabel('Área').selectOption({ index: 1 })
  await painelConvite.getByRole('button', { name: 'Enviar convite' }).click()

  // O convite passa pelo SMTP embutido do Supabase, limitado a poucos e-mails
  // por hora num projeto de desenvolvimento. Quando a cota estoura, a action
  // devolve a mensagem genérica de erro — e o teste falharia com um
  // "elemento não encontrado" que não diz nada. Espere pelos dois resultados
  // possíveis e transforme o erro num diagnóstico.
  await expect(
    painelConvite.getByText('Convite enviado.').or(painelConvite.getByRole('alert')),
  ).toBeVisible()

  const alerta = painelConvite.getByRole('alert')
  if (await alerta.count()) {
    throw new Error(
      `O convite falhou: "${await alerta.first().textContent()}". ` +
        'Se for limite de e-mail do Supabase, espere uma hora ou configure SMTP ' +
        'próprio em Authentication → SMTP Settings.',
    )
  }

  await expect(painelConvite.getByText('Convite enviado.')).toBeVisible()

  // A linha da pessoa recém-convidada mostra e-mail e status no mesmo
  // parágrafo ("fulano@x.com · Colaborador · Convite pendente"). Ancorar no
  // e-mail (único, com o stamp de Date.now()) e checar o conteúdo dali evita
  // um "getByText('Convite pendente')" solto, que quebra em modo estrito
  // assim que outra pessoa convidada por uma execução anterior deste mesmo
  // teste também está com o status pendente na base de desenvolvimento.
  const linhaConvidado = page.getByText(emailConvidado)
  await expect(linhaConvidado).toBeVisible()
  await expect(linhaConvidado).toContainText('Convite pendente')

  // Confirma no banco que o perfil nasceu com status 'invited'.
  const { data } = await adminClient()
    .from('profiles')
    .select('status, role')
    .eq('email', emailConvidado)
    .single()
  expect(data).toMatchObject({ status: 'invited', role: 'member' })
})
