#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

// Node 20.12+ lê o arquivo de ambiente nativamente.
process.loadEnvFile('.env.local')

const ref = process.env.SUPABASE_PROJECT_REF
const senha = process.env.SUPABASE_DB_PASSWORD

if (!ref || !senha) {
  console.error(
    'Faltam SUPABASE_PROJECT_REF e/ou SUPABASE_DB_PASSWORD no .env.local.\n' +
      'Eles estão no painel do Supabase, em Project Settings → Database.',
  )
  process.exit(1)
}

// encodeURIComponent é obrigatório: senhas do Supabase costumam ter !, * e @,
// que quebram a connection string se entrarem cruas.
const dbUrl = `postgresql://postgres:${encodeURIComponent(senha)}@db.${ref}.supabase.co:5432/postgres`

// --out <path>: usado por "gen types". Um redirect de shell (`> arquivo`) trunca
// o arquivo destino ANTES do comando rodar, então uma falha da CLI (por exemplo
// "gen types" exigindo Docker, que não existe nesta máquina) apaga um
// database.types.ts válido e o substitui por um JSON de erro ou por nada.
// Em vez disso, capturamos o stdout do processo filho aqui e só gravamos o
// arquivo se o comando terminou com sucesso E a saída realmente parece
// TypeScript gerado — senão o arquivo existente fica intocado.
const args = process.argv.slice(2)

// --- Trava do db:reset -----------------------------------------------------
// `supabase db reset` DERRUBA E RECRIA o banco inteiro a partir das migrations.
//
// Este projeto tem um único ambiente Supabase: o mesmo banco onde desenvolvemos
// é o que vai receber os cursos e as aulas que os líderes subirem. Um reset
// acidental — memória muscular, autocompletar do shell, uma sessão futura que
// não conhece este contexto — apaga o trabalho deles sem aviso e sem desfazer.
//
// Por isso o reset exige que quem o roda digite o ref do projeto à mão. Não é
// burocracia: é a diferença entre um comando que se digita sem pensar e um que
// obriga a olhar para qual banco está prestes a ser destruído.
//
//   npm run db:reset -- --apagar <ref>
//
// Aplicar migrations novas NÃO passa por aqui: `npm run db:push` é aditivo e
// não destrói nada.
const ehReset = args[0] === 'db' && args[1] === 'reset'
if (ehReset) {
  const indiceApagar = args.indexOf('--apagar')
  const refConfirmado = indiceApagar === -1 ? null : args[indiceApagar + 1]

  if (refConfirmado !== ref) {
    console.error(
      `\n⛔ "db reset" apaga e recria TODO o banco do projeto ${ref}.\n\n` +
        (refConfirmado
          ? `Você confirmou "${refConfirmado}", que não é o projeto configurado.\n\n`
          : 'Confirmação ausente.\n\n') +
        'Se é isso mesmo, digite o ref do projeto à mão:\n\n' +
        `  npm run db:reset -- --apagar ${ref}\n\n` +
        'Para apenas aplicar migrations novas, sem destruir nada:\n\n' +
        '  npm run db:push\n',
    )
    process.exit(1)
  }

  args.splice(indiceApagar, 2)
}

const outIndex = args.indexOf('--out')
let outPath = null
if (outIndex !== -1) {
  outPath = args[outIndex + 1]
  if (!outPath) {
    console.error('--out precisa de um caminho de arquivo depois dele.')
    process.exit(1)
  }
  args.splice(outIndex, 2)
}

if (outPath) {
  const result = spawnSync('npx', ['supabase', ...args, '--db-url', dbUrl], {
    // stdin e stderr seguem para o terminal (mensagens de progresso, como
    // "Connecting to..."); só o stdout é capturado, porque é nele que a CLI
    // escreve tanto o TypeScript gerado quanto o JSON de erro em caso de falha.
    stdio: ['inherit', 'pipe', 'inherit'],
    encoding: 'utf8',
  })

  const output = result.stdout ?? ''
  const looksValid = output.startsWith('export type Json =')

  if (result.status === 0 && looksValid) {
    writeFileSync(outPath, output)
    console.log(`Tipos gerados em ${outPath}.`)
    process.exit(0)
  }

  console.error(
    `\nFalha ao gerar "${outPath}" (status ${result.status ?? 'desconhecido'}` +
      (looksValid ? '' : ', saída não parece TypeScript válido') +
      `). O arquivo existente foi mantido sem alterações.`,
  )
  if (output) console.error(output)
  process.exit(result.status && result.status !== 0 ? result.status : 1)
}

const { status } = spawnSync('npx', ['supabase', ...args, '--db-url', dbUrl], {
  stdio: 'inherit',
})

process.exit(status ?? 1)
