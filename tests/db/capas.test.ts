import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CAPA_BUCKET, MAX_CAPA_BYTES } from '@/lib/storage/capas'
import { mintCapaUpload, verifyCapaUpload } from '@/server/capas-upload'
import { adminClient, authClient, createTestUser, criarLixeira } from './client'

// Cobre mintCapaUpload e verifyCapaUpload — as duas funções de
// src/server/capas-upload.ts que conversam de verdade com o Storage, sem
// depender de cookies(). Mesmo recorte de tests/db/attachments-upload.test.ts:
// o que ESTE arquivo não cobre, de propósito, é a checagem de PERMISSÃO
// (assertRole + podeGerenciarCapa) que embrulha as duas em src/server/
// capas.ts — chamar as próprias actions exige cookies() de um request
// Next.js de verdade. Essa checagem é a mesma forma de toda outra action de
// escrita do projeto, coberta pela suíte de RLS, não por teste direto.
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
// aqui, no afterAll, antes da lixeira.
const caminhosParaLimpar: string[] = []

function pngPequeno(tamanho = 1024) {
  return new File([new Uint8Array(tamanho)], 'capa.png', { type: 'image/png' })
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

      const verificado = await verifyCapaUpload(db, mint.data.path)
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

      const verificado = await verifyCapaUpload(db, mint.data.path)
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
})
