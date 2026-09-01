# GEX Academy

GEX Academy é a plataforma interna de treinamento da GEX: cursos organizados por área da empresa, com trilha de onboarding, fórum de dúvidas por aula e controle de acesso por papel (admin, líder, colaborador). O acesso é só por convite — não existe cadastro aberto.

## Pré-requisitos

- Node 20.12+ (o script de banco usa `process.loadEnvFile`, disponível a partir dessa versão).
- Um projeto Supabase de **desenvolvimento** já criado no [painel do Supabase](https://supabase.com/dashboard). Não há Supabase local nem Docker configurados neste projeto — todo `npm run db:*` e todo teste de banco fala direto com esse projeto remoto.

## Configuração

```bash
npm install
cp .env.local.example .env.local
```

Preencha `.env.local` com os valores do painel do Supabase (Project Settings):

| Variável | Onde encontrar | Uso |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → API | Next.js e testes |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Project Settings → API | Next.js e testes (chave pública) |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API | Só servidor — **nunca** prefixar com `NEXT_PUBLIC_`, nunca expor ao navegador |
| `SUPABASE_PROJECT_REF` | Project Settings → General ("Reference ID") | Só `scripts/db.mjs` (`db:push`/`db:reset`/`db:types`), para montar a connection string direta com o Postgres |
| `SUPABASE_DB_PASSWORD` | Project Settings → Database | Idem — senha do Postgres do projeto |
| `RESEND_API_KEY` | — | Reservado para fase futura de notificações por e-mail fora do fluxo de Auth |
| `EMAIL_FROM` | — | Idem |
| `NEXT_PUBLIC_SITE_URL` | — | Base usada para montar links de convite/recuperação de senha |

`.env.local` nunca é commitado (está no `.gitignore`).

## Comandos

| Comando | Faz o quê |
|---|---|
| `npm run dev` | Sobe o servidor de desenvolvimento em `http://localhost:3000` |
| `npm test` | Testes unitários (Vitest, sem tocar banco) |
| `npm run test:db` | Testes de integração contra o Postgres do projeto Supabase de desenvolvimento, RLS incluído |
| `npm run test:e2e` | Testes end-to-end (Playwright) contra um `npm run dev` local |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Build de produção do Next.js |
| `npm run db:push` | Aplica `supabase/migrations/` pendentes no banco remoto de desenvolvimento |
| `npm run db:reset -- --apagar <ref>` | Recria o banco do zero a partir das migrations. **Destrutivo** — exige o ref do projeto digitado à mão |

> ### ⛔ `db:reset` apaga o banco inteiro
>
> A GEX Academy usa **um único projeto Supabase**: o mesmo banco onde
> desenvolvemos é o que vai receber os cursos e as aulas que os líderes subirem.
> Não existe ambiente descartável separado.
>
> Por isso `db:reset` só roda com o ref do projeto digitado à mão:
>
> ```bash
> npm run db:reset -- --apagar <ref-do-projeto>
> ```
>
> `scripts/db.mjs` recusa o comando sem essa confirmação. A trava existe porque
> o reset não tem desfazer: ele derruba o schema e recria a partir das
> migrations, levando junto todo curso, aula, anexo e dúvida que existirem.
>
> **Para aplicar uma migration nova, use `npm run db:push`.** Ele é aditivo,
> não destrói nada e não passa pela trava. Na prática, `db:reset` só se
> justifica enquanto o banco tiver apenas dados de teste.

## Limpeza dos dados de teste

As suítes de integração e E2E criam usuários, áreas e cursos **no projeto
Supabase de verdade** e não os removem — por isso cada fixture carrega um
carimbo de `Date.now()` no e-mail ou no slug, para nunca colidir entre
execuções. Com o tempo isso enche a tela de Users e a lista de áreas.

```bash
node scripts/limpar-dados-de-teste.mjs            # mostra o que apagaria
node scripts/limpar-dados-de-teste.mjs --apagar   # apaga
```

O critério é o carimbo de 13 dígitos, **nunca o domínio do e-mail**:
`@gexcorp.com.br` é o domínio real da empresa e as fixtures também o usam.
Apagar por domínio removeria gente de verdade.

Rode a simulação antes de apagar e confira a lista de preservados.

## O primeiro administrador

A plataforma é fechada por convite: toda pessoa entra porque um admin a
convidou. Isso deixa um problema de partida — não existe quem convide o
primeiro. Num banco recém-criado, ninguém consegue entrar.

```bash
node scripts/criar-admin.mjs "voce@empresa.com.br" "Seu Nome Completo"
```

O script cria o usuário no Auth e o perfil correspondente com `role = 'admin'` e
`status = 'active'`, gera uma senha aleatória e a imprime **uma única vez**.
Troque-a em `/perfil` depois de entrar.

Ele usa a `service_role`, então roda apenas de onde o `.env.local` existe — nunca
de dentro da aplicação. Depois do primeiro admin, todo mundo entra por convite
pela tela de Pessoas.

Note que `npm run db:types` **não** está listado como algo para rodar neste ambiente: ele exige um runtime de contêiner (Docker) indisponível aqui, e o arquivo `src/lib/supabase/database.types.ts` é mantido **à mão** — ver o comentário no topo desse arquivo.

## Configuração manual no painel do Supabase (obrigatória)

O código sozinho não deixa o primeiro acesso funcionar. No painel do projeto, em **Authentication**:

1. **Sign-ups desabilitados** — a plataforma é só por convite (`invitePerson`, em `src/server/people.ts`, é o único jeito de criar conta). Desligue sign-up público.
2. **Email Templates → Invite user**, o link do template precisa ser exatamente:
   ```
   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/convite
   ```
3. **Email Templates → Reset password**, o link do template precisa ser exatamente:
   ```
   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/nova-senha
   ```

Sem `token_hash` no link (por exemplo, usando `{{ .ConfirmationURL }}` puro ou `token` em vez de `token_hash`), a rota `src/app/auth/confirm/route.ts` nunca recebe o parâmetro que precisa, cai em "link inválido", e ninguém consegue nem ativar a conta nem recuperar a senha.

O SMTP embutido do Supabase (usado enquanto não houver um provedor próprio configurado) libera só **poucos e-mails por hora** num projeto de desenvolvimento. Rode o teste E2E de convite (`admin convida pessoa...`, em `e2e/primeiro-acesso.spec.ts`) com moderação — várias execuções seguidas estouram a cota e passam a falhar por limite de envio, não por bug.

## Onde as coisas vivem

- `src/lib/access/` — regras puras de autorização de conteúdo (quem pode ver qual curso). **Mudar este código sem mudar as políticas RLS correspondentes (nas migrations de `supabase/migrations/`) na mesma alteração deixa as duas camadas divergentes** — uma delas vira a fonte de verdade errada.
- `src/lib/auth/` — sessão atual (`session.ts`), guarda de papel (`guards.ts`) e lista de rotas públicas (`public-routes.ts`), usada tanto pelo proxy (`src/proxy.ts`) quanto pelos layouts.
- `src/server/` — server actions. Toda função exportada de um arquivo `'use server'` é um endpoint chamável por qualquer sessão (mesmo sem link nenhum apontando para ela) — cada uma valida entrada com Zod, confere papel e nunca lança para a tela (retorna `ActionResult<T>`).
- `supabase/migrations/` — única fonte de verdade do schema e das políticas RLS. Aplicadas com `npm run db:push`; nunca editadas depois de já aplicadas — uma correção vira uma migration nova.

## Documentação de projeto

A especificação e os planos de cada fase estão em `docs/superpowers/`:

- `docs/superpowers/specs/2026-08-31-gex-academy-design.md` — especificação
- `docs/superpowers/plans/2026-08-31-gex-academy-fase-1-fundacao.md` — plano desta fase (autenticação, papéis, áreas)
- `docs/superpowers/plans/2026-08-31-gex-academy-fase-2-conteudo.md` — plano da fase de conteúdo (cursos, aulas)
- `docs/superpowers/plans/2026-08-31-gex-academy-fase-3-interacao.md` — plano da fase de interação (fórum, progresso)
