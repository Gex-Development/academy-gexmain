#!/usr/bin/env node
/**
 * Lista (e opcionalmente apaga) as capas órfãs do bucket `capas`.
 *
 * Órfã é o arquivo que NENHUMA área e NENHUM curso referencia. Acontece
 * quando alguém escolhe a imagem e abandona o formulário: o upload já subiu
 * para o Storage, mas a entidade nunca foi salva apontando para ele. Não é
 * defeito — é o preço, aceito de propósito, de o upload acontecer antes da
 * gravação. Este script é a contrapartida desse acordo.
 *
 * A comparação é feita com getPublicUrl(), a MESMA função do SDK que gerou
 * as URLs guardadas em cover_url. Remontar o prefixo à mão aqui seria uma
 * segunda cópia de uma regra que decide o que pode ser APAGADO — e duas
 * cópias divergem.
 *
 * A conta é por SUBTRAÇÃO do que está referenciado, nunca por heurística de
 * nome ou de idade do arquivo: qualquer palpite aqui apaga capa de produção.
 *
 * Uso:
 *   node scripts/limpar-capas-orfas.mjs            # só mostra o que apagaria
 *   node scripts/limpar-capas-orfas.mjs --apagar   # apaga de fato
 */
import { createClient } from '@supabase/supabase-js'

process.loadEnvFile('.env.local')

const BUCKET = 'capas'
const apagar = process.argv.includes('--apagar')

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

/**
 * Caminha o bucket inteiro. list() é por prefixo e paginado — sem a
 * paginação, um bucket com mais de 100 itens numa pasta faria o script
 * considerar órfão o que ele simplesmente não chegou a ver, e apagar.
 */
async function listarTudo(prefixo = '') {
  const encontrados = []
  let offset = 0
  for (;;) {
    const { data, error } = await db.storage
      .from(BUCKET)
      .list(prefixo, { limit: 100, offset })
    if (error) throw error
    if (!data || data.length === 0) break

    for (const item of data) {
      const caminho = prefixo ? `${prefixo}/${item.name}` : item.name
      // Pasta não tem metadata; arquivo tem. É como o SDK distingue os dois.
      if (item.id === null || item.metadata === null) {
        encontrados.push(...(await listarTudo(caminho)))
      } else {
        encontrados.push({ caminho, tamanho: item.metadata?.size ?? 0, criado: item.created_at })
      }
    }

    if (data.length < 100) break
    offset += data.length
  }
  return encontrados
}

const [{ data: areas, error: erroAreas }, { data: cursos, error: erroCursos }] = await Promise.all([
  db.from('areas').select('name, cover_url'),
  db.from('courses').select('title, cover_url'),
])
// Erro aqui não pode virar lista vazia: lista vazia faria TODA capa parecer
// órfã, e com --apagar isso limparia o bucket inteiro.
if (erroAreas) throw erroAreas
if (erroCursos) throw erroCursos

const referenciadas = new Set(
  [...areas, ...cursos].map((linha) => linha.cover_url).filter(Boolean),
)

const arquivos = await listarTudo()
const orfas = arquivos.filter(
  ({ caminho }) => !referenciadas.has(db.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl),
)

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`

console.log(`\nArquivos no bucket "${BUCKET}": ${arquivos.length}`)
console.log(`Referenciados por área ou curso: ${arquivos.length - orfas.length}`)
console.log(`Órfãos: ${orfas.length}\n`)

if (orfas.length > 0) {
  console.log('--- ÓRFÃOS ---')
  for (const o of orfas) {
    console.log(`  ${o.caminho}  (${mb(o.tamanho)}, criado em ${o.criado?.slice(0, 10) ?? '?'})`)
  }
  console.log(`\n  total: ${mb(orfas.reduce((s, o) => s + o.tamanho, 0))}\n`)
}

const emUso = arquivos.filter((a) => !orfas.includes(a))
if (emUso.length > 0) {
  console.log('--- EM USO (preservados) ---')
  for (const a of emUso) console.log(`  ${a.caminho}`)
  console.log()
}

if (!apagar) {
  console.log(orfas.length > 0 ? 'Rode com --apagar para executar.\n' : 'Nada a fazer.\n')
  process.exit(0)
}

if (orfas.length === 0) {
  console.log('Nada a apagar.\n')
  process.exit(0)
}

const { error } = await db.storage.from(BUCKET).remove(orfas.map((o) => o.caminho))
if (error) {
  console.error('⛔ Falha ao apagar:', error.message)
  process.exit(1)
}
console.log(`✅ ${orfas.length} arquivo(s) removido(s).\n`)
