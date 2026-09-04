import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CAPA_BUCKET, MAX_CAPA_BYTES } from '@/lib/storage/capas'
import { apagarCapaSubstituida, mintCapaUpload, verifyCapaUpload } from '@/server/capas-upload'
import { adminClient, authClient, createTestUser, criarLixeira } from './client'

// Cobre mintCapaUpload, verifyCapaUpload e apagarCapaSubstituida — as três
// funções de src/server/capas-upload.ts que conversam de verdade com o
// Storage, sem depender de cookies(). Mesmo recorte de
// tests/db/attachments-upload.test.ts: o que ESTE arquivo não cobre, de
// propósito, é a checagem de PERMISSÃO (assertRole + podeGerenciarCapa) que
// embrulha mint/verify em src/server/capas.ts, nem a orquestração de
// updateArea/updateCourse (src/server/areas.ts, courses.ts) que chama
// apagarCapaSubstituida depois de gravar — chamar essas actions exige
// cookies() de um request Next.js de verdade. Essa checagem é a mesma forma
// de toda outra action de escrita do projeto, coberta pela suíte de RLS,
// não por teste direto.
const db = adminClient()
const lixeira = criarLixeira()

let areaId: string
let cursoId: string
let liderId: string
let emailLider: string

// criarLixeira() só apaga LINHAS (areas, courses, profiles) — não tem como
// limpar objetos de Storage, porque capa não tem uma tabela própria para
// rastreá-los (ao contrário de lesson_attachments, que guarda storage_path).
// Por isso a limpeza dos objetos que os testes sobem de propósito é manual
// aqui, no afterAll, antes da lixeira. Alguns testes abaixo (os de
// apagarCapaSubstituida que provam remoção) já removem o próprio objeto
// antigo como parte do comportamento sob teste — o que sobra aqui é só o
// que sobrevive até o fim de um teste com sucesso.
const caminhosParaLimpar: string[] = []

function pngPequeno(tamanho = 1024) {
  return new File([new Uint8Array(tamanho)], 'capa.png', { type: 'image/png' })
}

async function subirCapa(escopo: 'area' | 'curso', id: string, tamanho = 1024) {
  const mint = await mintCapaUpload(db, escopo, id, { name: 'capa.png', type: 'image/png', size: tamanho })
  if (!mint.ok) throw new Error(`mint falhou: ${mint.error}`)

  const cliente = await authClient(emailLider)
  const { error } = await cliente.storage
    .from(CAPA_BUCKET)
    .uploadToSignedUrl(mint.data.path, mint.data.token, pngPequeno(tamanho), { contentType: 'image/png' })
  if (error) throw error

  return mint.data.path
}

beforeAll(async () => {
  const stamp = Date.now()
  const { data: area, error: areaError } = await db
    .from('areas')
    .insert({ name: 'Capas de Teste', slug: `capas-de-teste-${stamp}` })
    .select('id')
    .single()
  if (areaError) throw areaError
  areaId = area.id
  lixeira.area(areaId)

  emailLider = `lider-capas-${stamp}@gexcorp.com.br`
  liderId = await createTestUser({
    email: emailLider,
    fullName: 'Líder Capas de Teste',
    role: 'leader',
    areaId,
  })
  lixeira.usuario(liderId)

  const { data: curso, error: cursoError } = await db
    .from('courses')
    .insert({
      title: 'Curso com Capa Enviada',
      slug: `capa-enviada-${stamp}`,
      area_id: areaId,
      owner_id: liderId,
      status: 'published',
    })
    .select('id')
    .single()
  if (cursoError) throw cursoError
  cursoId = curso.id
  lixeira.curso(cursoId)
})

afterAll(async () => {
  // Falha alto em vez de engolir o erro — mesmo raciocínio de criarLixeira():
  // uma suíte verde não prova limpeza nenhuma se o remove() falhado for
  // ignorado.
  if (caminhosParaLimpar.length > 0) {
    const { error } = await db.storage.from(CAPA_BUCKET).remove(caminhosParaLimpar)
    if (error) throw new Error(`falha ao limpar objetos de storage do teste: ${error.message}`)
  }
  await lixeira.limpar()
})

describe('mintCapaUpload: recusa antes de mintar qualquer URL', () => {
  it('recusa tipo de arquivo não permitido', async () => {
    const resultado = await mintCapaUpload(db, 'curso', cursoId, {
      name: 'logo.svg',
      type: 'image/svg+xml',
      size: 100,
    })
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.error).toBe('Tipo de arquivo não permitido. Use PNG, JPEG ou WebP.')
  })

  it('recusa tamanho declarado acima de 5 MB', async () => {
    const resultado = await mintCapaUpload(db, 'curso', cursoId, {
      name: 'gigante.png',
      type: 'image/png',
      size: MAX_CAPA_BYTES + 1,
    })
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.error).toBe('A imagem passa de 5 MB.')
  })
})

describe('verifyCapaUpload: valida o que o Storage recebeu, não o que foi declarado', () => {
  it(
    'ponta a ponta: mint, upload direto ao Storage (sem passar pelo servidor Next.js) e verify devolvendo a URL pública',
    async () => {
      const mint = await mintCapaUpload(db, 'area', areaId, {
        name: 'Capa da Área.png',
        type: 'image/png',
        size: 1024,
      })
      expect(mint.ok).toBe(true)
      if (!mint.ok) return
      expect(mint.data.path.startsWith(`area/${areaId}/`)).toBe(true)

      // Client autenticado como o líder — não o admin/service_role — pois é
      // este mesmo cliente (createBrowserSupabase, na UI) quem faz o upload
      // em produção. A URL assinada, mintada no passo anterior, é a própria
      // autorização; RLS nem entra em jogo (não há política de escrita).
      const cliente = await authClient(emailLider)
      const { error: erroUpload } = await cliente.storage
        .from(CAPA_BUCKET)
        .uploadToSignedUrl(mint.data.path, mint.data.token, pngPequeno(), { contentType: 'image/png' })
      expect(erroUpload).toBeNull()
      caminhosParaLimpar.push(mint.data.path)

      const verificado = await verifyCapaUpload(db, 'area', areaId, mint.data.path)
      expect(verificado.ok).toBe(true)
      if (!verificado.ok) return

      // Bucket público: a URL segue o formato .../object/public/{bucket}/{path}
      // — devolvida por getPublicUrl(), não montada à mão.
      expect(verificado.data.url).toContain(`/storage/v1/object/public/${CAPA_BUCKET}/${mint.data.path}`)

      // Prova de verdade de que o bucket é público: a URL responde sem
      // nenhuma autenticação, com o mesmo cliente anônimo que a vitrine usa.
      const resposta = await fetch(verificado.data.url)
      expect(resposta.status).toBe(200)
    },
    60_000,
  )

  it(
    'achado: o bucket já recusa o upload de um objeto acima de 5 MB — antes de qualquer verificação',
    async () => {
      // MAX_CAPA_BYTES (src/lib/storage/capas.ts) e o file_size_limit do
      // bucket 'capas' (migration 0012) são o MESMO número, 5242880, de
      // propósito — mesmo desenho de 'lesson-attachments' (documentado em
      // tests/db/attachments-upload.test.ts). Na prática isso significa que
      // um upload que declara um tamanho pequeno e envia um arquivo acima de
      // 5 MB nunca chega a existir como objeto: o próprio Storage recusa com
      // 413/EntityTooLarge antes de qualquer byte ser persistido — não há
      // nada para verifyCapaUpload rejeitar DEPOIS, porque não há objeto.
      // Este teste documenta esse comportamento real (a barreira de
      // tamanho, aqui, é do Storage, não do código da aplicação) — o teste
      // seguinte, de tipo de conteúdo, é o que prova que a camada de
      // aplicação (verifyCapaUpload) tem trabalho próprio a fazer.
      const mint = await mintCapaUpload(db, 'curso', cursoId, {
        name: 'capa.png',
        type: 'image/png',
        size: 1024,
      })
      expect(mint.ok).toBe(true)
      if (!mint.ok) return

      const arquivoGigante = new File([new Uint8Array(MAX_CAPA_BYTES + 1024)], 'capa.png', {
        type: 'image/png',
      })

      const cliente = await authClient(emailLider)
      const { error: erroUpload } = await cliente.storage
        .from(CAPA_BUCKET)
        .uploadToSignedUrl(mint.data.path, mint.data.token, arquivoGigante, { contentType: 'image/png' })
      expect(erroUpload).not.toBeNull()
      expect(erroUpload?.statusCode).toBe('413')

      // Nada foi criado.
      const { data: infoDepois } = await db.storage.from(CAPA_BUCKET).info(mint.data.path)
      expect(infoDepois).toBeNull()
    },
    60_000,
  )

  it(
    'caso adversarial: tipo de conteúdo REALMENTE enviado não é permitido, mesmo com o tipo DECLARADO no mint sendo válido — verifyCapaUpload recusa e remove o objeto',
    async () => {
      // Esta é a versão do "declara pequeno, envia outra coisa" que
      // efetivamente passa pelo Storage (o bucket não restringe tipo de
      // conteúdo, só tamanho) e por isso chega viva a verifyCapaUpload — é
      // ESTE teste, não o de tamanho acima, que prova que a terceira etapa
      // faz o que promete: se verifyCapaUpload fosse removido (ou não
      // checasse o tipo real), o objeto abaixo sobreviveria no bucket
      // PÚBLICO, servindo um PDF disfarçado de capa.png.
      const mint = await mintCapaUpload(db, 'curso', cursoId, {
        name: 'capa.png',
        type: 'image/png',
        size: 1024,
      })
      expect(mint.ok).toBe(true)
      if (!mint.ok) return

      const arquivoDisfarcado = new File([new Uint8Array(2048)], 'capa.png', {
        type: 'application/pdf',
      })

      const cliente = await authClient(emailLider)
      const { error: erroUpload } = await cliente.storage
        .from(CAPA_BUCKET)
        .uploadToSignedUrl(mint.data.path, mint.data.token, arquivoDisfarcado, {
          contentType: 'application/pdf',
        })
      expect(erroUpload).toBeNull()
      caminhosParaLimpar.push(mint.data.path)

      const verificado = await verifyCapaUpload(db, 'curso', cursoId, mint.data.path)
      expect(verificado.ok).toBe(false)
      if (!verificado.ok) {
        expect(verificado.error).toBe('Tipo de arquivo não permitido. Use PNG, JPEG ou WebP.')
      }

      // A parte que importa: o objeto NÃO sobrevive no bucket depois da
      // rejeição — verifyCapaUpload removeu.
      const { data: infoDepois } = await db.storage.from(CAPA_BUCKET).info(mint.data.path)
      expect(infoDepois).toBeNull()
    },
    60_000,
  )

  // Achado da revisão: numa versão anterior, esta checagem morava na Server
  // Action (confirmCapaUpload, em src/server/capas.ts), onde nenhum teste de
  // banco a alcança — a action exige cookies() de um request Next.js de
  // verdade. Movida para dentro de verifyCapaUpload, puro e testável, no
  // mesmo formato do teste equivalente de anexo
  // (tests/db/attachments-upload.test.ts:131-140).
  it('recusa um caminho fora da pasta desta entidade', async () => {
    const resultado = await verifyCapaUpload(db, 'curso', cursoId, 'pasta-de-outro-curso/arquivo.png')
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.error).toBe('Caminho de upload inválido.')
  })
})

describe('verifyCapaUpload: confirmar um upload nunca apaga nada', () => {
  // NÃO é o teste de regressão da rodada 1 — e afirmar isso seria enganoso:
  // o bug da rodada 1 vivia dentro de um `if (previousUrl) { ... }` que só
  // rodava quando `verifyCapaUpload` recebia esse argumento. A correção da
  // rodada 2 removeu `previousUrl` da assinatura por completo — não sobrou
  // nenhum jeito de fazer este teste (ou qualquer chamada real) exercitar o
  // ramo que apagava, porque o parâmetro que o alimentava não existe mais.
  // Rodar isto contra o código da rodada 1 passaria igual, porque nunca
  // fornece `previousUrl` — não discrimina as duas versões.
  //
  // O que este teste prova, com valor próprio: confirmar upload continua
  // sem tocar em nenhum objeto além do que acabou de subir, mesmo quando
  // duas confirmações acontecem em sequência para a mesma entidade — a
  // exclusão de capa substituída não é alcançável a partir daqui, ponto,
  // porque a função não recebe (nem nunca mais vai receber, pela
  // assinatura) informação nenhuma sobre uma capa "anterior".
  it(
    'confirmar uma segunda capa para a mesma entidade não apaga a primeira, mesmo sem salvar',
    async () => {
      const caminhoPrimeiro = await subirCapa('curso', cursoId)
      const primeiro = await verifyCapaUpload(db, 'curso', cursoId, caminhoPrimeiro)
      expect(primeiro.ok).toBe(true)
      caminhosParaLimpar.push(caminhoPrimeiro)

      const caminhoSegundo = await subirCapa('curso', cursoId)
      const segundo = await verifyCapaUpload(db, 'curso', cursoId, caminhoSegundo)
      expect(segundo.ok).toBe(true)
      caminhosParaLimpar.push(caminhoSegundo)

      const { data: infoPrimeiro } = await db.storage.from(CAPA_BUCKET).info(caminhoPrimeiro)
      expect(infoPrimeiro).not.toBeNull()
      const { data: infoSegundo } = await db.storage.from(CAPA_BUCKET).info(caminhoSegundo)
      expect(infoSegundo).not.toBeNull()
    },
    60_000,
  )
})

describe('apagarCapaSubstituida: só apaga quando a linha GRAVADA prova que a capa mudou', () => {
  it(
    'apaga a capa anterior do NOSSO bucket quando a linha gravada mostra a capa nova',
    async () => {
      const caminhoAntigo = await subirCapa('curso', cursoId)
      const antigo = await verifyCapaUpload(db, 'curso', cursoId, caminhoAntigo)
      expect(antigo.ok).toBe(true)
      if (!antigo.ok) return

      const caminhoNovo = await subirCapa('curso', cursoId)
      const novo = await verifyCapaUpload(db, 'curso', cursoId, caminhoNovo)
      expect(novo.ok).toBe(true)
      if (!novo.ok) return
      caminhosParaLimpar.push(caminhoNovo)

      // `{ cover_url: novo.data.url }` representa a linha como ela sai de
      // updateArea/updateCourse DEPOIS de gravar — não o valor calculado
      // antes de gravar.
      await apagarCapaSubstituida(db, 'curso', cursoId, antigo.data.url, { cover_url: novo.data.url })

      const { data: infoNovo } = await db.storage.from(CAPA_BUCKET).info(caminhoNovo)
      expect(infoNovo).not.toBeNull()

      const { data: infoAntigo } = await db.storage.from(CAPA_BUCKET).info(caminhoAntigo)
      expect(infoAntigo).toBeNull()
    },
    60_000,
  )

  // Este é o teste que a parte 4 da rodada 2 tentou ser e não conseguiu: lá,
  // "urlNova" era uma string solta que o próprio teste inventava — nada
  // impedia de inventar um valor igual ao antigo, mas isso também não
  // discriminava nada, porque a função antiga não tinha como saber se
  // aquele valor batia com o banco. Agora a "prova" É o banco: passar uma
  // `linhaGravada` cujo cover_url ainda é o valor ANTIGO é exatamente o que
  // aconteceria se esta função fosse chamada ANTES da gravação de verdade
  // (a leitura mais recente disponível, nesse momento, ainda mostraria o
  // antigo) — generalizando o bug da rodada 1 para qualquer chamador futuro
  // que reordene o código sem perceber. Também cobre o caminho comum e
  // inofensivo de um Salvar que não mexeu na capa.
  it(
    'recusa apagar quando a linha gravada ainda mostra a capa antiga — mesma situação de uma chamada antes da gravação de verdade',
    async () => {
      const caminho = await subirCapa('curso', cursoId)
      const verificado = await verifyCapaUpload(db, 'curso', cursoId, caminho)
      expect(verificado.ok).toBe(true)
      if (!verificado.ok) return
      caminhosParaLimpar.push(caminho)

      await apagarCapaSubstituida(db, 'curso', cursoId, verificado.data.url, { cover_url: verificado.data.url })

      // A parte que importa: o objeto SOBREVIVE — a função recusou apagar
      // porque a "prova" não mostrava mudança nenhuma.
      const { data: info } = await db.storage.from(CAPA_BUCKET).info(caminho)
      expect(info).not.toBeNull()
    },
    60_000,
  )

  // Caso que faltava (apontado na rodada 3): limpar o campo de capa —
  // cover_url passa a NULL — também é uma substituição de verdade, e a
  // antiga precisa ser apagada como qualquer outra troca.
  it(
    'apaga a capa anterior quando a linha gravada mostra a capa NULA (campo de capa limpo)',
    async () => {
      const caminho = await subirCapa('curso', cursoId)
      const verificado = await verifyCapaUpload(db, 'curso', cursoId, caminho)
      expect(verificado.ok).toBe(true)
      if (!verificado.ok) return

      await apagarCapaSubstituida(db, 'curso', cursoId, verificado.data.url, { cover_url: null })

      const { data: info } = await db.storage.from(CAPA_BUCKET).info(caminho)
      expect(info).toBeNull()
    },
    60_000,
  )

  it(
    'NÃO apaga uma "capa anterior" que pertence a OUTRA entidade — cover_url antigo não é permissão para apagar o que quiser',
    async () => {
      // Cenário adversarial: a entidade sendo salva é o curso, mas a URL
      // "antiga" passada é da ÁREA — uma entidade diferente. Sem a checagem
      // de prefixo dentro de apagarCapaSubstituida, isto apagaria a capa de
      // uma entidade só porque o valor lido como "antes" não bate com a
      // entidade sendo salva agora.
      const caminhoDaArea = await subirCapa('area', areaId)
      const verificadoArea = await verifyCapaUpload(db, 'area', areaId, caminhoDaArea)
      expect(verificadoArea.ok).toBe(true)
      if (!verificadoArea.ok) return
      caminhosParaLimpar.push(caminhoDaArea)

      const caminhoDoCurso = await subirCapa('curso', cursoId)
      const verificadoCurso = await verifyCapaUpload(db, 'curso', cursoId, caminhoDoCurso)
      expect(verificadoCurso.ok).toBe(true)
      if (!verificadoCurso.ok) return
      caminhosParaLimpar.push(caminhoDoCurso)

      await apagarCapaSubstituida(db, 'curso', cursoId, verificadoArea.data.url, {
        cover_url: verificadoCurso.data.url,
      })

      // A capa da área sobrevive intacta.
      const { data: infoArea } = await db.storage.from(CAPA_BUCKET).info(caminhoDaArea)
      expect(infoArea).not.toBeNull()
    },
    60_000,
  )

  it(
    'ignora uma URL antiga que não é do nosso bucket (capa cadastrada por URL colada) — não tenta apagar, não lança',
    async () => {
      await expect(
        apagarCapaSubstituida(db, 'curso', cursoId, 'https://exemplo-externo.com/imagens/capa-antiga.png', {
          cover_url: 'https://exemplo-externo.com/imagens/capa-nova.png',
        }),
      ).resolves.toBeUndefined()
    },
  )

  it('não faz nada quando não havia capa anterior (primeira capa da entidade)', async () => {
    await expect(
      apagarCapaSubstituida(db, 'curso', cursoId, null, { cover_url: 'https://qualquer.coisa/capa.png' }),
    ).resolves.toBeUndefined()
  })
})
