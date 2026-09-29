@AGENTS.md

# GEX Academy

Plataforma interna de treinamento da GEX Corp: cada líder de área publica cursos para os colaboradores, e quem é novo começa pela trilha inicial. Acesso só por convite.

- **Produção:** https://academy.gexmain.com — Vercel, projeto `academy-gexmain` (time Gex). **Push na `main` publica sozinho.**
- **Banco, login e arquivos:** Supabase, projeto **Gex Academy** — o único que pode ser tocado. A conta da empresa tem outros projetos; nenhum deles.
- **E-mail:** Resend (`nao-responda@academy.gexmain.com`); o SMTP do Supabase Auth aponta para ele.
- Situação atual e pendências: `ONDE-PARAMOS.md`. Instalação: `README.md`. Especificações e planos: `docs/superpowers/`.

## Nunca

- **`npm run db:reset`** — apaga e recria o banco, que é o de **produção**. Migration nova: `npm run db:push` (só acrescenta).
- **`npm run test:e2e` inteiro** — `e2e/primeiro-acesso.spec.ts` manda convite por e-mail de verdade. E2E só spec a spec: `npx playwright test e2e/<arquivo>.spec.ts`.
- **`npm run db:types`** — exige runtime de container que esta máquina não tem. `src/lib/supabase/database.types.ts` é mantido à mão: tabela nova, tipo novo junto.
- **Credenciais em arquivo, memória ou conversa.** Ficam só no `.env.local` (fora do git) e nas variáveis da Vercel.
- **`git add -A` na raiz.** `.agents/`, `.claude/` e `skills-lock.json` são locais e não entram no repositório.

## Comandos

| | |
|---|---|
| `npm run dev` | servidor local em http://localhost:3000 (usa o Supabase real) |
| `npm run typecheck` / `npm run lint` | tipos e lint |
| `npm test` | unitários (Vitest) |
| `npm run test:db` | testes de banco, contra o Supabase **real** |
| `npx playwright test e2e/<arquivo>.spec.ts` | um spec E2E |
| `CAPTURAS=1 npx playwright test e2e/capturas.spec.ts` | capturas das telas do aluno, dois temas, desktop e celular, em `test-results/capturas/` |
| `node scripts/limpar-dados-de-teste.mjs` | lista fixtures de teste que sobraram (`--apagar` apaga) |
| `node scripts/limpar-capas-orfas.mjs` | lista capas sem área/curso no Storage (`--apagar` apaga) |

A CI (`.github/workflows/verificacao.yml`) roda tipos, lint, unitários e build a cada push. Ela **não** trava o deploy: a Vercel publica mesmo com teste vermelho.

## Convenções

- **Esta versão do Next é diferente da conhecida.** Antes de usar API do Next, ler `node_modules/next/dist/docs/`. Exemplos: `middleware` virou `src/proxy.ts`; `params` e `searchParams` são Promise; error boundary usa `retry()`, não `reset()`.
- **Cor só por token.** Nenhum componente cita cor literal nem usa `dark:`. O tema claro é o `@theme` de `src/app/globals.css`; o escuro é `:root.dark`, que redefine os mesmos tokens. Cor nova = token novo nos dois blocos.
- **Contraste mínimo 4,5:1**, nos dois temas. `src/lib/tema/tokens.test.ts` lê o `globals.css` e mede os pares — se falhar, ajuste o token, não o limite. No claro, ciano não é texto nem ação.
- **O `<html>` não recebe `className` no JSX** (o remonte do Strict Mode apagaria a classe `dark`). A fonte Geist entra pelo `<body>`.
- **Pele "Vidro GEX":** vidro (`bg-vidro border-vidro-borda backdrop-blur-md`) só no destaque da home, na lista de episódios, na lista lateral da aula e na barra do topo — nunca sobre capa. Selecionado = `bg-selecionado border-selecionado-borda text-selecionado-texto`. Progresso = `bg-gradient-to-r from-azul to-ciano`.
- **Fileira horizontal:** use `FileiraRolavel` (`src/components/catalog/fileira-rolavel.tsx`) — setas ‹ › no cabeçalho no lugar da barra de rolagem (escondida), a partir de `sm`. A lista usa `-mx-4 px-4 scroll-px-4` junto com `snap-x`/`snap-start`. O `scroll-px-4` não é enfeite — o encaixe da rolagem ignora o `padding`, e sem ele o primeiro card de uma fileira que rola fica 16px à esquerda do título.
- **Destaque que muda com o tema:** para um detalhe que deve ser ciano no escuro e azul no claro (filete da aula atual, por exemplo), use `var(--color-acao)`, não `var(--color-ciano)` — o ciano é fixo nos dois temas e some sobre fundo claro.
- **Arquivo `'use server'` só exporta função async.** Lógica pura vai num irmão `*-query.ts` (ou em `src/lib/`), testável sem request.
- **Regra de acesso mora em dois lugares que precisam concordar:** `src/lib/access/can-access-course.ts` e a função SQL `can_access_course`. `tests/db/paridade-acesso.test.ts` compara as duas.
- **RLS é por linha, não por coluna.** Liberar a linha libera todas as colunas.
- **Teste de banco:** todo fixture registrado na lixeira (`criarLixeira`) no escopo do módulo, antes de qualquer asserção. DELETE negado por RLS não dá erro — apaga zero linhas; a asserção é sobre a linha continuar existindo.
- **Capas:** área 1600×1000, curso 1280×800. Sem capa do curso, usa a da área; sem as duas, degradê (`capaComReserva`).
- **Textos de tela em português do Brasil.**
