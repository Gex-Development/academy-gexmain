import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ATTACHMENT_BUCKET, MAX_ATTACHMENT_BYTES } from '@/lib/storage/attachments'
import { mintAttachmentUpload, verifyAndRegisterAttachment } from '@/server/attachments-upload'
import { adminClient, authClient, createTestUser, criarLixeira } from './client'

// Cobre o seguro que substituiu o upload por Server Action: Server Actions do
// Next.js limitam o corpo da requisição a 1 MB por padrão, e o teto real do
// runtime serverless da Vercel (~4,5 MB) continua valendo mesmo se esse
// limite for ampliado na configuração — um anexo de 50 MB nunca chegaria ao
// servidor daquele jeito. Por isso o arquivo agora sobe direto do navegador
// para o Storage (mintAttachmentUpload dá a URL assinada, o cliente sobe os
// bytes, verifyAndRegisterAttachment confirma e só então grava a linha).
//
// mintAttachmentUpload e verifyAndRegisterAttachment não dependem de
// cookies() — por isso moraram em attachments-upload.ts, sem 'use server',
// exatamente como courses-query.ts fez para a regra de publicação (ver o
// comentário lá). O que ESTE arquivo não cobre, de propósito, é a checagem
// de PERMISSÃO (assertRole + getLessonForEdit) que embrulha as duas em
// attachments.ts — chamar as próprias actions exige cookies() de um request
// Next.js de verdade, e cai em "called outside a request scope" fora dele
// (mesma limitação documentada em tests/db/courses.test.ts). Essa checagem é
// o MESMO padrão de toda outra action de escrita do projeto (createLesson,
// updateCourse etc.), nenhuma delas com teste direto pelo mesmo motivo — o
// que existe hoje para cobrir "pessoa errada mexendo em curso errado" é a
// suíte de RLS (rls.test.ts), e ela não muda aqui.
const db = adminClient()
const lixeira = criarLixeira()

let areaId: string
let liderId: string
let emailLider: string
let aulaId: string

// Objetos de Storage que os testes sobem de propósito (o rollback do próprio
// código já remove o que falha; isto cobre o que sobrevive até o fim de um
// teste com sucesso, que criarLixeira() não alcança — ela só apaga linhas).
const caminhosParaLimpar: string[] = []

beforeAll(async () => {
  const stamp = Date.now()
  const { data: area, error: areaError } = await db
    .from('areas')
    .insert({ name: 'Upload Direto', slug: `upload-direto-${stamp}` })
    .select('id')
    .single()
  if (areaError) throw areaError
  areaId = area.id
  lixeira.area(areaId)

  emailLider = `lider-upload-${stamp}@gexcorp.com.br`
  liderId = await createTestUser({
    email: emailLider,
    fullName: 'Líder Upload Direto',
    role: 'leader',
    areaId,
  })
  lixeira.usuario(liderId)

  const { data: curso, error: cursoError } = await db
    .from('courses')
    .insert({
      title: 'Curso com Anexos Grandes',
      slug: `anexos-grandes-${stamp}`,
      area_id: areaId,
      owner_id: liderId,
      status: 'published',
    })
    .select('id')
    .single()
  if (cursoError) throw cursoError
  lixeira.curso(curso.id)

  const { data: aula, error: aulaError } = await db
    .from('lessons')
    .insert({
      course_id: curso.id,
      title: 'Aula com Material Pesado',
      slug: 'material-pesado',
      video_provider: 'youtube',
      video_ref: 'dQw4w9WgXcQ',
      status: 'published',
    })
    .select('id')
    .single()
  if (aulaError) throw aulaError
  aulaId = aula.id
})

afterAll(async () => {
  // Falha alto em vez de engolir o erro (mesmo raciocínio de criarLixeira():
  // uma suíte verde não prova limpeza nenhuma se o remove() falhado for
  // ignorado). A linha (se sobreviveu) some com o curso, por CASCADE — mas o
  // objeto no bucket não; daí a limpeza explícita aqui, antes da lixeira.
  if (caminhosParaLimpar.length > 0) {
    const { error } = await db.storage.from(ATTACHMENT_BUCKET).remove(caminhosParaLimpar)
    if (error) throw new Error(`falha ao limpar objetos de storage do teste: ${error.message}`)
  }
  await lixeira.limpar()
})

describe('mintAttachmentUpload: recusa antes de mintar qualquer URL', () => {
  it('recusa tipo de arquivo não permitido', async () => {
    const resultado = await mintAttachmentUpload(db, aulaId, {
      name: 'virus.exe',
      type: 'application/x-msdownload',
      size: 100,
    })
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.error).toBe('Tipo de arquivo não permitido.')
  })

  it('recusa tamanho declarado acima de 50 MB', async () => {
    const resultado = await mintAttachmentUpload(db, aulaId, {
      name: 'gigante.pdf',
      type: 'application/pdf',
      size: MAX_ATTACHMENT_BYTES + 1,
    })
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.error).toBe('O arquivo passa de 50 MB.')
  })

  // As duas recusas acima acontecem em validateAttachment(), ANTES de
  // qualquer chamada a createSignedUploadUrl() — não há URL para revogar
  // nem objeto para limpar, porque nada chega a ser mintado. É a leitura
  // direta do código-fonte de mintAttachmentUpload (o `return fail(erro)`
  // vem antes do `admin.storage...createSignedUploadUrl`), não algo
  // observável de fora sem instrumentar a chamada de rede.
})

describe('verifyAndRegisterAttachment: valida o que o Storage recebeu, não o que foi declarado', () => {
  it('recusa registrar um caminho fora da pasta desta aula', async () => {
    const resultado = await verifyAndRegisterAttachment(db, {
      lessonId: aulaId,
      path: 'pasta-de-outra-aula/arquivo.pdf',
      fileName: 'arquivo.pdf',
      uploadedBy: liderId,
    })
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.error).toBe('Caminho de upload inválido.')
  })

  // O plano original deste teste era subir ~50 MB + 1 KB de verdade e provar
  // que verifyAndRegisterAttachment recusa o registro pelo TAMANHO real.
  // Rodando de verdade contra o Storage, isso nunca chega a acontecer: o
  // bucket 'lesson-attachments' tem file_size_limit=52428800 (exatamente
  // MAX_ATTACHMENT_BYTES, definido em 0001_schema_inicial.sql), e o próprio
  // uploadToSignedUrl() já falha com 413/EntityTooLarge antes de qualquer
  // objeto existir — não há nada para verifyAndRegisterAttachment recusar
  // depois. Achado, não invenção: a asserção abaixo documenta esse
  // comportamento real, em vez de fingir que a rejeição acontece no passo
  // seguinte. É uma SEGUNDA barreira genuína (a nossa não depende de o
  // bucket continuar configurado assim), não uma sobreposta à toa — por
  // isso os dois testes seguintes provam a mesma ideia ("não confie no que
  // foi declarado no mint") pelos eixos que UM upload de verdade consegue
  // alcançar: tipo de conteúdo, e tamanho real abaixo do teto do bucket.
  it(
    'o bucket já recusa o upload de um objeto acima de 50 MB — antes de qualquer registro',
    async () => {
      const mint = await mintAttachmentUpload(db, aulaId, {
        name: 'relatorio.pdf',
        type: 'application/pdf',
        size: 1024,
      })
      expect(mint.ok).toBe(true)
      if (!mint.ok) return

      const bytes = new Uint8Array(MAX_ATTACHMENT_BYTES + 1024)
      const arquivoGigante = new File([bytes], 'relatorio.pdf', { type: 'application/pdf' })

      const cliente = await authClient(emailLider)
      const { error: erroUpload } = await cliente.storage
        .from(ATTACHMENT_BUCKET)
        .uploadToSignedUrl(mint.data.path, mint.data.token, arquivoGigante, {
          contentType: 'application/pdf',
        })
      expect(erroUpload).not.toBeNull()
      expect(erroUpload?.statusCode).toBe('413')

      // Nada foi criado: nem objeto, nem linha.
      const { data: infoDepois } = await db.storage.from(ATTACHMENT_BUCKET).info(mint.data.path)
      expect(infoDepois).toBeNull()
      const { data: linha } = await db
        .from('lesson_attachments')
        .select('id')
        .eq('storage_path', mint.data.path)
      expect(linha).toEqual([])
    },
    120_000,
  )

  it(
    'recusa registrar quando o tipo de conteúdo REALMENTE enviado ao Storage não é permitido, mesmo com o tipo DECLARADO no mint sendo válido',
    async () => {
      // O mint declara "application/pdf" — passa a primeira barreira. O
      // upload de verdade manda outro Content-Type (o navegador, ou um
      // cliente malicioso chamando o Storage direto, escolhe esse cabeçalho
      // na hora de subir, não na hora de mintar). O bucket não restringe
      // tipo (só tamanho, via file_size_limit), então o upload é aceito — e
      // é exatamente por isso que o registro precisa checar de novo, contra
      // o que o Storage de fato guardou (info()), não contra o que foi
      // declarado duas etapas atrás.
      const mint = await mintAttachmentUpload(db, aulaId, {
        name: 'relatorio.pdf',
        type: 'application/pdf',
        size: 1024,
      })
      expect(mint.ok).toBe(true)
      if (!mint.ok) return

      const arquivo = new File([new Uint8Array(2048)], 'relatorio.pdf', {
        type: 'application/x-msdownload',
      })

      const cliente = await authClient(emailLider)
      const { error: erroUpload } = await cliente.storage
        .from(ATTACHMENT_BUCKET)
        .uploadToSignedUrl(mint.data.path, mint.data.token, arquivo, {
          contentType: 'application/x-msdownload',
        })
      expect(erroUpload).toBeNull()
      caminhosParaLimpar.push(mint.data.path)

      const registro = await verifyAndRegisterAttachment(db, {
        lessonId: aulaId,
        path: mint.data.path,
        fileName: 'relatorio.pdf',
        uploadedBy: liderId,
      })
      expect(registro.ok).toBe(false)
      if (!registro.ok) expect(registro.error).toBe('Tipo de arquivo não permitido.')

      // Rollback: o objeto que não bate com o tipo permitido não fica no
      // bucket, e nenhuma linha é criada para ele.
      const { data: infoDepois } = await db.storage.from(ATTACHMENT_BUCKET).info(mint.data.path)
      expect(infoDepois).toBeNull()
      const { data: linha } = await db
        .from('lesson_attachments')
        .select('id')
        .eq('storage_path', mint.data.path)
      expect(linha).toEqual([])
    },
  )

  it('grava o tamanho REAL do Storage, não o declarado no mint, quando os dois divergem mas o real ainda está dentro do limite', async () => {
    // Declara 1 KB — bem menor do que o que realmente sobe (2 MB, ainda
    // longe do teto de 50 MB). Isto prova a mesma ideia dos dois testes
    // acima pelo lado que passa: quando o real é aceitável mas diferente do
    // declarado, é o real que fica gravado.
    const TAMANHO_REAL = 2 * 1024 * 1024
    const mint = await mintAttachmentUpload(db, aulaId, {
      name: 'metas.xlsx',
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: 1024,
    })
    expect(mint.ok).toBe(true)
    if (!mint.ok) return

    const arquivo = new File([new Uint8Array(TAMANHO_REAL)], 'metas.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    const cliente = await authClient(emailLider)
    const { error: erroUpload } = await cliente.storage
      .from(ATTACHMENT_BUCKET)
      .uploadToSignedUrl(mint.data.path, mint.data.token, arquivo, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
    expect(erroUpload).toBeNull()
    caminhosParaLimpar.push(mint.data.path)

    const registro = await verifyAndRegisterAttachment(db, {
      lessonId: aulaId,
      path: mint.data.path,
      fileName: 'metas.xlsx',
      uploadedBy: liderId,
    })
    expect(registro.ok).toBe(true)
    if (!registro.ok) return

    const { data: linha } = await db
      .from('lesson_attachments')
      .select('size_bytes')
      .eq('id', registro.data.id)
      .single()
    expect(linha?.size_bytes).toBe(TAMANHO_REAL)
  })

  it(
    'ponta a ponta: mint, upload direto ao Storage (sem passar pelo servidor Next.js) e registro — inclusive acima do teto de ~4,5 MB da Vercel',
    async () => {
      const TAMANHO = 5 * 1024 * 1024 // 5 MB: acima do teto de corpo de requisição das funções serverless da Vercel (~4,5 MB) — a prova do porquê deste redesenho existe.
      const NOME = 'Apresentação Final.pdf'

      const mint = await mintAttachmentUpload(db, aulaId, {
        name: NOME,
        type: 'application/pdf',
        size: TAMANHO,
      })
      expect(mint.ok).toBe(true)
      if (!mint.ok) return

      const bytes = new Uint8Array(TAMANHO)
      const arquivo = new File([bytes], NOME, { type: 'application/pdf' })

      // Client autenticado como o líder — não o admin/service_role — pois é
      // este mesmo cliente (createBrowserSupabase, na UI) quem faz o upload
      // em produção. A URL assinada, mintada no passo anterior já com
      // permissão checada, é a própria autorização.
      const cliente = await authClient(emailLider)
      const { error: erroUpload } = await cliente.storage
        .from(ATTACHMENT_BUCKET)
        .uploadToSignedUrl(mint.data.path, mint.data.token, arquivo, { contentType: 'application/pdf' })
      expect(erroUpload).toBeNull()
      caminhosParaLimpar.push(mint.data.path)

      const registro = await verifyAndRegisterAttachment(db, {
        lessonId: aulaId,
        path: mint.data.path,
        fileName: NOME,
        uploadedBy: liderId,
      })
      expect(registro.ok).toBe(true)
      if (!registro.ok) return

      const { data: linha, error: linhaError } = await db
        .from('lesson_attachments')
        .select('id, file_name, size_bytes, mime_type, storage_path, lesson_id')
        .eq('id', registro.data.id)
        .single()
      expect(linhaError).toBeNull()
      expect(linha?.file_name).toBe(NOME)
      expect(linha?.lesson_id).toBe(aulaId)
      expect(linha?.mime_type).toBe('application/pdf')
      // O tamanho gravado vem do que o Storage confirmou (info()), não do
      // que foi declarado no mint — os dois batem aqui porque desta vez o
      // cliente não mentiu, mas é o valor REAL que está na linha.
      expect(linha?.size_bytes).toBe(TAMANHO)
    },
    60_000,
  )
})
