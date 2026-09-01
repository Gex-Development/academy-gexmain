import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { decideAttachmentDownload } from '@/app/api/anexos/[id]/attachment-access'
import { canAccessCourse, type AccessUser } from '@/lib/access'
import { ATTACHMENT_BUCKET } from '@/lib/storage/attachments'
import { paraManagedCourse, SELECT_CURSO, type LinhaCurso } from '@/server/courses-query'
import { adminClient, authClient, createTestUser, criarLixeira } from './client'

// Gap A da revisão de fase: GET /api/anexos/[id] nunca teve teste nenhum,
// embora seja o único caminho que entrega bytes de anexo, reimplemente a
// decisão de acesso em código de aplicação e assine com o cliente admin.
// getCurrentUser() (via createServerSupabase → next/headers) exige cookies()
// de um request Next.js de verdade, e a rota não pode ser invocada fora
// dele — por isso a lógica de decisão foi extraída para
// src/app/api/anexos/[id]/attachment-access.ts (decideAttachmentDownload),
// mesma técnica de courses-query.ts/catalog-query.ts/attachments-query.ts, e
// é essa função REAL (não uma reimplementação em paralelo) que este arquivo
// testa contra o Postgres de verdade.
const db = adminClient()
const lixeira = criarLixeira()

let areaX: string
let areaY: string
let leaderXId: string
let emailLeaderX: string
let memberXId: string
let emailMemberX: string
let memberYId: string
let emailMemberY: string

let attachmentPublicada: { id: string; storagePath: string }
let attachmentRascunho: { id: string }

const caminhosParaLimpar: string[] = []

beforeAll(async () => {
  const stamp = Date.now()

  const { data: areas, error: areasError } = await db
    .from('areas')
    .insert([
      { name: 'Anexos Acesso X', slug: `anexos-acesso-x-${stamp}` },
      { name: 'Anexos Acesso Y', slug: `anexos-acesso-y-${stamp}` },
    ])
    .select('id, slug')
  if (areasError) throw areasError
  areaX = areas!.find((a) => a.slug.startsWith('anexos-acesso-x'))!.id
  areaY = areas!.find((a) => a.slug.startsWith('anexos-acesso-y'))!.id
  lixeira.area(areaX)
  lixeira.area(areaY)

  emailLeaderX = `lider-anexos-acesso-${stamp}@gexcorp.com.br`
  leaderXId = await createTestUser({
    email: emailLeaderX,
    fullName: 'Líder Anexos Acesso',
    role: 'leader',
    areaId: areaX,
  })
  lixeira.usuario(leaderXId)

  emailMemberX = `colega-com-acesso-${stamp}@gexcorp.com.br`
  memberXId = await createTestUser({
    email: emailMemberX,
    fullName: 'Colega Com Acesso',
    role: 'member',
    areaId: areaX,
  })
  lixeira.usuario(memberXId)

  emailMemberY = `colega-sem-acesso-${stamp}@gexcorp.com.br`
  memberYId = await createTestUser({
    email: emailMemberY,
    fullName: 'Colega Sem Acesso',
    role: 'member',
    areaId: areaY,
  })
  lixeira.usuario(memberYId)

  const { data: curso, error: cursoError } = await db
    .from('courses')
    .insert({
      title: 'Curso Anexos Acesso',
      slug: `curso-anexos-acesso-${stamp}`,
      area_id: areaX,
      owner_id: leaderXId,
      status: 'published',
    })
    .select('id')
    .single()
  if (cursoError) throw cursoError
  lixeira.curso(curso!.id)

  const { data: aulas, error: aulasError } = await db
    .from('lessons')
    .insert([
      {
        course_id: curso!.id,
        title: 'Aula Publicada',
        slug: 'aula-publicada',
        video_provider: 'youtube',
        video_ref: 'dQw4w9WgXcQ',
        status: 'published',
      },
      {
        course_id: curso!.id,
        title: 'Aula Em Rascunho',
        slug: 'aula-rascunho',
        video_provider: 'youtube',
        video_ref: 'dQw4w9WgXcQ',
        status: 'draft',
      },
    ])
    .select('id, slug')
  if (aulasError) throw aulasError
  const aulaPublicada = aulas!.find((a) => a.slug === 'aula-publicada')!
  const aulaRascunho = aulas!.find((a) => a.slug === 'aula-rascunho')!

  const pathPublicada = `${aulaPublicada.id}/material-publicado-${stamp}.txt`
  const { error: uploadError } = await db.storage
    .from(ATTACHMENT_BUCKET)
    .upload(pathPublicada, new Blob(['conteúdo de teste']), { contentType: 'text/plain' })
  if (uploadError) throw uploadError
  caminhosParaLimpar.push(pathPublicada)

  const { data: anexoPublicada, error: anexoPublicadaError } = await db
    .from('lesson_attachments')
    .insert({
      lesson_id: aulaPublicada.id,
      file_name: 'material-publicado.txt',
      storage_path: pathPublicada,
      mime_type: 'text/plain',
      size_bytes: 100,
      uploaded_by: leaderXId,
    })
    .select('id, storage_path')
    .single()
  if (anexoPublicadaError) throw anexoPublicadaError
  attachmentPublicada = { id: anexoPublicada.id, storagePath: anexoPublicada.storage_path }

  const { data: anexoRascunho, error: anexoRascunhoError } = await db
    .from('lesson_attachments')
    .insert({
      lesson_id: aulaRascunho.id,
      file_name: 'material-rascunho.txt',
      storage_path: `${aulaRascunho.id}/material-rascunho-${stamp}.txt`,
      mime_type: 'text/plain',
      size_bytes: 100,
      uploaded_by: leaderXId,
    })
    .select('id')
    .single()
  if (anexoRascunhoError) throw anexoRascunhoError
  attachmentRascunho = { id: anexoRascunho.id }
})

afterAll(async () => {
  if (caminhosParaLimpar.length > 0) {
    const { error } = await db.storage.from(ATTACHMENT_BUCKET).remove(caminhosParaLimpar)
    if (error) throw new Error(`falha ao limpar objetos de storage do teste: ${error.message}`)
  }
  await lixeira.limpar()
})

function acesso(userId: string, role: AccessUser['role'], areaId: string | null): AccessUser {
  return { id: userId, role, status: 'active', areaId }
}

describe('decideAttachmentDownload (lógica real de GET /api/anexos/[id])', () => {
  it('colega de outra área, sem acesso ao curso: 403', async () => {
    const decisao = await decideAttachmentDownload(
      db,
      new Set(),
      acesso(memberYId, 'member', areaY),
      attachmentPublicada.id,
    )
    expect(decisao.ok).toBe(false)
    if (!decisao.ok) expect(decisao.status).toBe(403)
  })

  it('colega com acesso ao curso: devolve o caminho de storage, e um link assinado de verdade sai dele', async () => {
    const decisao = await decideAttachmentDownload(
      db,
      new Set(),
      acesso(memberXId, 'member', areaX),
      attachmentPublicada.id,
    )
    expect(decisao.ok).toBe(true)
    if (!decisao.ok) return
    expect(decisao.storagePath).toBe(attachmentPublicada.storagePath)

    // A rota, de posse deste caminho, gera o link assinado e redireciona —
    // prova que o caminho devolvido é utilizável de verdade, não só uma
    // string qualquer.
    const { data: assinado, error } = await db.storage
      .from(ATTACHMENT_BUCKET)
      .createSignedUrl(decisao.storagePath, 60)
    expect(error).toBeNull()
    expect(assinado?.signedUrl).toBeTruthy()
  })

  it('membro do setor é recusado no material de uma aula em RASCUNHO; quem gerencia o curso é permitido', async () => {
    const comoMembro = await decideAttachmentDownload(
      db,
      new Set(),
      acesso(memberXId, 'member', areaX),
      attachmentRascunho.id,
    )
    expect(comoMembro.ok).toBe(false)
    if (!comoMembro.ok) expect(comoMembro.status).toBe(403)

    // Controle: mesmo anexo, mesma área — só o NÍVEL de acesso muda (líder
    // gerencia o curso, o membro só o acessa). Sem este par, o teste acima só
    // provaria "aula em rascunho nunca libera", não que é especificamente
    // GERENCIAR que faz a diferença.
    const comoLider = await decideAttachmentDownload(
      db,
      new Set(),
      acesso(leaderXId, 'leader', areaX),
      attachmentRascunho.id,
    )
    expect(comoLider.ok).toBe(true)
  })

  it('anexo inexistente: 404', async () => {
    const decisao = await decideAttachmentDownload(
      db,
      new Set(),
      acesso(leaderXId, 'leader', areaX),
      '00000000-0000-0000-0000-000000000000',
    )
    expect(decisao.ok).toBe(false)
    if (!decisao.ok) expect(decisao.status).toBe(404)
  })
})

// Gap D da revisão de fase: nada provava que um líder de OUTRA área é
// recusado ao excluir anexo (deleteAttachment, src/server/attachments.ts).
// deleteAttachment roda a exclusão em si pelo cliente ADMIN — RLS não é
// backstop nenhum ali — e o único freio é getLessonForEdit → getManagedCourse
// (achado 4 da revisão de fase: getManagedCourse agora É
// canAccessCourse(...) === 'manage'). deleteAttachment não pode ser chamada
// fora do runtime do Next (cookies(), mesma limitação de sempre), então este
// teste roda o MESMO pipeline de dados que getManagedCourse usa — a consulta
// SELECT_CURSO autenticada como o líder de fora (provando que RLS ainda
// LIBERA a leitura de um curso publicado — courses_leitura não distingue
// área para curso publicado) e a MESMA função canAccessCourse decidindo
// 'manage' !== o nível obtido — para mostrar que a recusa depende
// inteiramente da checagem de aplicação, exatamente como o achado descreve.
describe('getManagedCourse: líder de outra área não gerencia curso alheio publicado (base do freio de deleteAttachment)', () => {
  it('RLS libera a leitura do curso alheio (é publicado); canAccessCourse nega o nível "manage"', async () => {
    const stamp = Date.now()
    const { data: areaAlheia, error: areaAlheiaError } = await db
      .from('areas')
      .insert({ name: 'Área Alheia Delete', slug: `area-alheia-delete-${stamp}` })
      .select('id')
      .single()
    if (areaAlheiaError) throw areaAlheiaError
    lixeira.area(areaAlheia!.id)

    const { data: cursoAlheio, error: cursoAlheioError } = await db
      .from('courses')
      .insert({
        title: 'Curso Alheio Delete',
        slug: `curso-alheio-delete-${stamp}`,
        area_id: areaAlheia!.id,
        owner_id: leaderXId,
        status: 'published',
      })
      .select('id')
      .single()
    if (cursoAlheioError) throw cursoAlheioError
    lixeira.curso(cursoAlheio!.id)

    // getLessonForEdit/getManagedCourse leem com o cliente do USUÁRIO (RLS
    // vale) — courses_leitura libera qualquer curso publicado para qualquer
    // colaborador ativo, então a linha é legível mesmo por quem não gerencia.
    const comoLiderX = await authClient(emailLeaderX)
    const { data: linha, error: leituraError } = await comoLiderX
      .from('courses')
      .select(SELECT_CURSO)
      .eq('id', cursoAlheio!.id)
      .single()
    expect(leituraError).toBeNull()

    const curso = paraManagedCourse(linha as unknown as LinhaCurso)
    const nivel = canAccessCourse(acesso(leaderXId, 'leader', areaX), curso, new Set())
    // leaderX gerencia área X, não a área alheia — 'view' (curso publicado,
    // áreas diferentes) ou 'none', nunca 'manage'. É esta mesma comparação
    // que getManagedCourse (e, por trás dela, deleteAttachment) faz.
    expect(nivel).not.toBe('manage')
  })
})
