# Onde paramos

Situação do projeto, não instruções de instalação — isso está no [README](README.md).
Este arquivo responde "em que pé está e o que falta", que é a pergunta de quem
volta ao projeto depois de um tempo, ou de quem chega nele pela primeira vez.

**Atualizado em:** 07/09/2026

---

## No ar

**https://academy.gexmain.com**

- Hospedagem: Vercel, projeto `academy-gexmain`, time **Gex**
- Repositório: `github.com/Gex-Development/academy-gexmain`
- Banco, autenticação e arquivos: Supabase (projeto **Gex Academy**)
- E-mail: Resend, remetente `nao-responda@academy.gexmain.com`. O SMTP do
  Supabase Auth também aponta para o Resend — sem isso, convite e recuperação
  de senha saem pelo servidor interno do Supabase, que tem limite baixo
- DNS: Cloudflare, `academy` como CNAME para a Vercel, modo DNS-only

Push na `main` publica sozinho. Antes de 07/09 isso era manual, pela CLI.

---

## O que está pronto

Quatro fases construídas e no ar:

1. **Fundação** — convite por e-mail (não há cadastro aberto), papéis
   (admin, líder, colaborador), RLS em todas as tabelas
2. **Conteúdo** — áreas, cursos, aulas, vídeo, anexos com URL assinada,
   progresso por aula
3. **Interação** — fórum de dúvidas por aula, fila do líder, solicitação de
   acesso a área bloqueada, painel de acompanhamento
4. **Vitrine** — home no estilo Netflix por área, rota `/area/[slug]`, tema
   escuro (padrão) e claro

Depois disso: verificação automática no GitHub Actions, upload direto de capa
(sem colar URL), áreas sem curso aparecendo na home, e acesso de leitura a
mais de uma área por pessoa.

**Verificação:** 304 testes unitários, 163 de banco, 6 specs de ponta a ponta,
13 migrations.

---

## O que falta

- **Cadastrar as capas das áreas.** Sem imagem, a vitrine cai num gradiente da
  marca — apresentável, mas não é a arte final. Área: 1600×1000. Curso: 1280×800
- **Criar as áreas de Backend e Design.** Hoje existem Copy, Gestão de Tráfego,
  Afiliados e Infra - FunnelOps
- **Roteiro de conferência em produção**: entrar como colaborador de verdade,
  ver o cadeado numa área alheia, pedir acesso, aprovar, postar dúvida,
  responder, conferir que o link de anexo expira. É o único jeito de provar o
  e-mail funcionando de ponta a ponta

---

## Armadilhas

Coisas que custaram caro para descobrir. Vale ler antes de mexer.

**Nunca rode `npm run db:reset`.** Ele apaga e recria o banco — que é o de
**produção**, com a conta do dono do produto e as áreas reais. Use
`npm run db:push`, que só acrescenta. Existe uma trava em `scripts/db.mjs`,
mas não conte com ela.

**Nunca rode a suíte de ponta a ponta inteira.** `e2e/primeiro-acesso.spec.ts`
dispara convite por e-mail de verdade. Rode spec por spec, pelo caminho.

**Nunca rode `npm run db:types`.** Exige um runtime de container que não existe
nesta máquina. O `database.types.ts` é mantido à mão — ao criar tabela nova,
acrescente o tipo lá junto com a migration.

**Só existe um projeto Supabase autorizado**, o "Gex Academy". A conta da
empresa tem outros projetos; nenhum deles pode ser tocado.

**A regra de autorização mora em dois lugares.** A função TypeScript
(`src/lib/access/can-access-course.ts`) e a função SQL `can_access_course`
precisam concordar sempre. `tests/db/paridade-acesso.test.ts` compara as duas
caso a caso contra o banco real — se ele quebrar, é achado de verdade, não
teste para ajustar.

**RLS é por linha, não por coluna.** Uma política que libere a linha libera
todas as colunas dela. Foi essa confusão que gerou os vazamentos de conteúdo
no começo do projeto — daí a contagem de aulas vir de uma função
`security definer`, e não de um join.

**Os testes de banco rodam contra o Supabase real.** Todo fixture precisa
registrar o id na lixeira (`criarLixeira`) no escopo do módulo, antes de
qualquer asserção. Confira com `node scripts/limpar-dados-de-teste.mjs`, que
por padrão só mostra o que apagaria.

---

## Onde continuar

- Especificações e planos: `docs/superpowers/`
- Convenções de código, tema e tokens de cor: [AGENTS.md](AGENTS.md) e o README
- Migrations: `supabase/migrations/`, em ordem numérica
