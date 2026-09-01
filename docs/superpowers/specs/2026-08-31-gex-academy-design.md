# GEX Academy — Design do MVP

**Data:** 2026-08-31
**Status:** aprovado para planejamento
**Autor:** tech.infra@gexcorp.com.br

## 1. Objetivo

Plataforma interna de ensino da GEX. Cada líder de setor publica aulas para seus
colaboradores, sem depender do time técnico. Todo colaborador novo começa pela
trilha inicial da empresa e depois avança para o conteúdo do seu setor
(Copy, Tráfego, Design, Infraestrutura e os que vierem).

O sucesso do MVP é medido por cinco resultados:

1. O admin convida um colaborador e ele faz o primeiro login sem suporte técnico.
2. O colaborador novo conclui a trilha inicial e o admin enxerga isso no painel.
3. Um líder publica um curso com aula, vídeo e anexo sem ajuda de um desenvolvedor.
4. Um colaborador sem acesso nunca alcança vídeo, anexo ou fórum de um curso bloqueado
   (garantido por teste automatizado).
5. Uma dúvida postada recebe resposta, e ambos os lados são avisados por e-mail.

Idioma da interface: português do Brasil. Fuso: `America/Sao_Paulo`.

## 2. Escopo

### Entra no MVP

- Convite por e-mail, login com senha, recuperação de senha.
- Três papéis: `admin`, `leader`, `member`.
- Áreas (setores), cursos com capa, aulas com vídeo.
- Trilha inicial de onboarding visível para todos os colaboradores ativos.
- Vitrine de cursos: todas as capas visíveis, cadeado nos cursos sem acesso.
- Solicitação de acesso a curso bloqueado, com fila de aprovação para o admin.
- Anexos por aula (upload no Supabase Storage, download por link assinado).
- Fórum de dúvidas por aula, público para quem tem acesso à aula.
- Progresso: marcar aula como concluída, barra de progresso por curso.
- Painel de acompanhamento para admin e líder.
- E-mails: convite, recuperação de senha, nova dúvida, resposta na dúvida,
  solicitação de acesso e decisão sobre ela.

### Fica para depois (banco preparado, tela não construída)

Certificados, quizzes e provas, busca global, notificações dentro do app,
pré-requisitos entre cursos, exportação de relatórios, login com Google (SSO),
aplicativo mobile, legendas e transcrição, múltiplos idiomas.

## 3. Papéis e permissões

| Papel | Pode |
|---|---|
| `member` | Ver a vitrine inteira; acessar conteúdo dos cursos liberados; concluir aulas; perguntar e responder no fórum das aulas que acessa; solicitar acesso a curso bloqueado |
| `leader` | Tudo do `member`, mais: criar, editar, publicar e arquivar cursos e aulas **da sua área**; subir anexos; responder com selo de professor; fixar e resolver dúvidas; ver o progresso dos cursos da sua área |
| `admin` | Tudo, em todas as áreas, mais: convidar e desativar pessoas, definir papel e área, criar e editar áreas, decidir solicitações de acesso, liberar cursos individualmente, ver o painel completo |

Cada pessoa pertence a **uma** área (`profiles.area_id`). Acesso a conteúdo de
outra área acontece por liberação individual do admin, não por segunda área.

## 4. Modelo de dados

Postgres no Supabase. Todas as tabelas com `id uuid` gerado por `gen_random_uuid()`,
`created_at timestamptz not null default now()` e, onde houver edição, `updated_at`.

### `profiles`
Extensão de `auth.users` (mesmo `id`, chave estrangeira com `on delete cascade`).

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | referencia `auth.users.id` |
| `full_name` | text not null | |
| `email` | text not null unique | |
| `avatar_url` | text null | |
| `role` | text not null | `admin` \| `leader` \| `member`, default `member` |
| `area_id` | uuid null | referencia `areas.id` |
| `status` | text not null | `invited` \| `active` \| `inactive`, default `invited` |

### `areas`

| Coluna | Tipo | Notas |
|---|---|---|
| `name` | text not null | ex.: "Tráfego" |
| `slug` | text not null unique | ex.: `trafego` |
| `description` | text null | |
| `color` | text null | hex, usado na etiqueta e no fallback de capa |
| `position` | int not null default 0 | ordem na vitrine |

### `courses`

| Coluna | Tipo | Notas |
|---|---|---|
| `area_id` | uuid null | nulo somente quando `is_onboarding = true` |
| `title` | text not null | |
| `slug` | text not null unique | |
| `description` | text null | texto simples, exibido também no card bloqueado |
| `cover_url` | text null | imagem no Storage; sem imagem, usa a cor da área |
| `is_onboarding` | boolean not null default false | |
| `status` | text not null | `draft` \| `published`, default `draft` |
| `owner_id` | uuid not null | referencia `profiles.id` (o líder criador) |
| `position` | int not null default 0 | |

Restrição: `is_onboarding = true` exige `area_id is null`; `is_onboarding = false`
exige `area_id not null`.

### `lessons`

| Coluna | Tipo | Notas |
|---|---|---|
| `course_id` | uuid not null | referencia `courses.id`, `on delete cascade` |
| `title` | text not null | |
| `slug` | text not null | único dentro do curso |
| `description` | text null | texto com formatação leve, sanitizado na exibição |
| `video_provider` | text not null | `youtube` \| `vturb` |
| `video_ref` | text not null | ID do vídeo (YouTube) ou ID do player (VTurb) |
| `duration_seconds` | int null | informado pelo líder, opcional |
| `status` | text not null | `draft` \| `published`, default `draft` |
| `position` | int not null default 0 | |

### `lesson_attachments`

| Coluna | Tipo | Notas |
|---|---|---|
| `lesson_id` | uuid not null | `on delete cascade` |
| `file_name` | text not null | nome original, exibido ao aluno |
| `storage_path` | text not null unique | `lessons/{lesson_id}/{uuid}-{slug}.{ext}` |
| `mime_type` | text not null | |
| `size_bytes` | bigint not null | |
| `uploaded_by` | uuid not null | referencia `profiles.id` |

### `course_access`
Liberações individuais concedidas pelo admin. Acesso pela área do colaborador
**não** gera linha aqui — é calculado.

| Coluna | Tipo | Notas |
|---|---|---|
| `user_id` | uuid not null | |
| `course_id` | uuid not null | |
| `granted_by` | uuid not null | referencia `profiles.id` |

Único em (`user_id`, `course_id`).

### `access_requests`

| Coluna | Tipo | Notas |
|---|---|---|
| `user_id` | uuid not null | |
| `course_id` | uuid not null | |
| `status` | text not null | `pending` \| `approved` \| `denied`, default `pending` |
| `message` | text null | justificativa opcional do colaborador |
| `decided_by` | uuid null | |
| `decided_at` | timestamptz null | |

Índice único parcial garantindo no máximo uma solicitação `pending`
por (`user_id`, `course_id`).

### `lesson_progress`

| Coluna | Tipo | Notas |
|---|---|---|
| `user_id` | uuid not null | chave primária composta |
| `lesson_id` | uuid not null | chave primária composta |
| `completed_at` | timestamptz not null default now() | |

Concluir é explícito: o aluno clica em "Marcar como concluída". Desmarcar apaga a linha.

### `questions`

| Coluna | Tipo | Notas |
|---|---|---|
| `lesson_id` | uuid not null | `on delete cascade` |
| `author_id` | uuid not null | |
| `body` | text not null | texto puro, até 4000 caracteres |
| `is_pinned` | boolean not null default false | só líder e admin alteram |
| `resolved_at` | timestamptz null | marcada como resolvida pelo líder |

### `answers`

| Coluna | Tipo | Notas |
|---|---|---|
| `question_id` | uuid not null | `on delete cascade` |
| `author_id` | uuid not null | |
| `body` | text not null | texto puro, até 4000 caracteres |

O selo "Professor" é derivado na exibição: o autor é `admin`, ou é `leader` da
área do curso. Não existe coluna para isso.

## 5. Regra de acesso

Uma única função, `canAccessCourse(user, course)`, em `lib/access/`. Avaliada nesta ordem,
retornando no primeiro caso que der positivo:

1. `user.status !== 'active'` → **sem acesso** (vale inclusive para admin desativado).
2. `user.role === 'admin'` → acesso total, inclusive a rascunhos.
3. `user.role === 'leader'` e `user.area_id === course.area_id` → acesso total ao curso da
   sua área, inclusive rascunhos, com permissão de edição.
4. `course.status !== 'published'` → **sem acesso** (rascunho só aparece para quem edita).
5. `course.is_onboarding === true` → acesso para todo colaborador ativo.
6. `course.area_id === user.area_id` → acesso automático ao conteúdo do próprio setor.
7. Existe linha em `course_access` para (`user.id`, `course.id`) → acesso liberado
   individualmente.
8. Caso contrário → **bloqueado**.

A função devolve um resultado tipado — `{ level: 'none' | 'view' | 'manage' }` — em vez de
um booleano, porque a tela do líder precisa distinguir "pode ver" de "pode editar".

### O que "bloqueado" significa

Um curso bloqueado **continua visível na vitrine**: capa, título, área, descrição e número
de aulas. Isso é intencional — o colaborador descobre o que existe na empresa e pode pedir
acesso. O que fica protegido é o conteúdo: **vídeo, anexos e fórum de qualquer aula do
curso são inacessíveis**, tanto pela tela quanto por acesso direto à URL ou à API.

Cursos em rascunho não aparecem na vitrine para ninguém além do dono e do admin.

## 6. Telas e rotas

### Público — `app/(auth)/`
- `/login` — e-mail e senha.
- `/convite` — o colaborador aceita o convite e define a senha.
- `/recuperar-senha` e `/nova-senha`.

### Colaborador — `app/(app)/`
- `/` — saudação; bloco "Continue de onde parou"; a trilha inicial em destaque enquanto
  não estiver concluída; abaixo, a vitrine de cursos agrupada por área, com cadeado nos
  bloqueados.
- `/curso/[slug]` — capa, descrição, progresso e lista de aulas com marca de concluída.
  Se bloqueado: apenas descrição e o botão *Solicitar acesso* (que vira "Solicitação
  enviada" enquanto houver uma pendente).
- `/curso/[slug]/aula/[slug]` — player, título, descrição, botões *Marcar como concluída*
  e *Próxima aula*, seção **Materiais** e seção **Dúvidas**.
- `/perfil` — nome, foto e troca de senha.

### Líder — `app/(manage)/`
- `/gerenciar` — cursos da sua área, com botão de criar curso.
- `/gerenciar/cursos/[id]` — edição do curso (título, descrição, capa, publicar/rascunho)
  e lista de aulas reordenável por arraste.
- `/gerenciar/cursos/[id]/aulas/[id]` — editor da aula: título, descrição, campo de vídeo
  com preview, anexos e publicação.
- `/gerenciar/duvidas` — fila de perguntas sem resposta nos cursos da sua área.
- `/gerenciar/progresso` — painel de acompanhamento: progresso por pessoa e por curso,
  com destaque para quem ainda não concluiu a trilha inicial. O líder vê a própria área;
  o admin vê todas.

### Admin — `app/(admin)/`
- `/admin/pessoas` — lista, convite (nome, e-mail, papel, área), troca de área e papel,
  desativação.
- `/admin/areas` — criar e editar setores.
- `/admin/solicitacoes` — fila do cadeado, com aprovar e negar.

## 7. Fluxos principais

**Entrada de um colaborador.** O admin cria o convite em `/admin/pessoas` informando nome,
e-mail, papel e área. O Supabase Auth envia o convite; ao definir a senha, `status` vira
`active` e ele cai na home com a trilha inicial em destaque.

**Publicação de uma aula.** O líder cria o curso (nasce como rascunho), adiciona a aula,
cola o link do vídeo, anexa os documentos e publica. Publicar o curso exige pelo menos uma
aula publicada — a interface avisa quando falta.

**Dúvida e resposta.** O aluno escreve a pergunta na aula. O dono do curso recebe e-mail e
a pergunta entra na fila dele. Ao responder, o aluno recebe e-mail e a resposta aparece
com o selo *Professor*. O líder pode fixar a pergunta e marcá-la como resolvida.

**Pedido de acesso.** O aluno clica no curso com cadeado e solicita acesso, opcionalmente
com uma justificativa. O admin recebe e-mail e decide na fila. Aprovar cria a linha em
`course_access` e avisa o colaborador; negar também avisa.

**Mudança de setor.** O admin altera `profiles.area_id`. O acesso ao conteúdo do novo setor
passa a valer imediatamente, e o do antigo se encerra — sem trabalho manual. Liberações
individuais em `course_access` sobrevivem à mudança.

## 8. Vídeo

O líder cola, num único campo, a URL do YouTube **ou** o código de incorporação do VTurb.
`lib/video/` identifica o provedor e extrai o identificador:

- **YouTube** — aceita as formas `youtube.com/watch?v=`, `youtu.be/` e `youtube.com/embed/`;
  guarda o ID de 11 caracteres. Exibido em iframe de `youtube-nocookie.com`, com
  `rel=0` para não sugerir vídeos de terceiros no fim.
- **VTurb** — o snippet fornecido é um `<script>` que carrega um player identificado por um
  UUID. O parser extrai esse UUID por expressão regular e guarda apenas ele; o embed é
  montado pela aplicação. **Se o formato do snippet do VTurb for diferente do esperado,
  `lib/video/` é o único arquivo a ajustar** — nada mais no sistema conhece o formato.

O editor mostra o preview do player antes de salvar e recusa um valor que não case com
nenhum dos dois formatos.

**Aviso de confidencialidade na interface:** o editor informa o líder de que vídeo "não
listado" no YouTube é acessível por qualquer pessoa com o link — está escondido, não
protegido. Para conteúdo interno sensível, a orientação é usar VTurb com trava de domínio.
A escolha é por aula.

## 9. Anexos

Bucket **privado** `lesson-attachments` no Supabase Storage.

- Upload apenas por líder da área do curso ou admin, através de uma server action.
- Tipos aceitos: PDF, DOCX, XLSX, PPTX, CSV, TXT, ZIP, PNG, JPG.
- Limite de 50 MB por arquivo.
- O download nunca usa URL pública: a aplicação verifica `canAccessCourse` e só então gera
  um **link assinado válido por 60 segundos**. Assim ninguém baixa material de curso
  bloqueado, e um link copiado não continua funcionando depois.
- Apagar o anexo remove a linha e o objeto do Storage na mesma operação.

## 10. Fórum de dúvidas

Fica abaixo dos materiais, na página da aula. Visível para quem tem acesso à aula.

- Perguntas ordenadas com as fixadas primeiro, depois as mais recentes.
- Respostas em ordem cronológica, com selo *Professor* quando o autor é o líder da área
  ou um admin.
- Cada pessoa edita e apaga o que é seu. Líder e admin moderam qualquer conteúdo.
- Apagar uma pergunta apaga as respostas dela.
- Limite de 4000 caracteres e no máximo 10 publicações por pessoa a cada 5 minutos,
  para conter engano e abuso.

## 11. E-mails

| Evento | Destinatário | Remetente |
|---|---|---|
| Convite para a plataforma | colaborador | Supabase Auth |
| Recuperação de senha | colaborador | Supabase Auth |
| Nova dúvida na aula | dono do curso | Resend |
| Resposta na sua dúvida | autor da pergunta | Resend |
| Nova solicitação de acesso | admins | Resend |
| Solicitação aprovada ou negada | solicitante | Resend |

Os transacionais saem pelo Resend com o domínio `gexcorp.com.br` verificado. Falha no envio
**nunca** derruba a ação principal: a pergunta é salva mesmo que o e-mail não saia; o erro
é registrado no log.

## 12. Arquitetura técnica

**Stack:** Next.js 16 (App Router) com TypeScript, Tailwind CSS e shadcn/ui.
Supabase para Postgres, Auth e Storage. Deploy na Vercel, no subdomínio
`academy.gexcorp.com.br`.

Migrations em SQL versionadas no repositório (`supabase/migrations/`), aplicadas pela
Supabase CLI. Os tipos do banco são gerados com `supabase gen types typescript` e
commitados, para que uma mudança de schema quebre a compilação em vez de quebrar em produção.

### Estrutura de pastas

```
src/
  app/
    (auth)/      login, convite, recuperação de senha
    (app)/       home, curso, aula, perfil
    (manage)/    área do líder
    (admin)/     área do admin
  lib/
    access/      canAccessCourse — o núcleo da autorização
    video/       parser de YouTube e VTurb
    storage/     upload e links assinados
    supabase/    clientes de servidor e de navegador
    email/       templates e envio
  server/
    courses.ts   lessons.ts   forum.ts   people.ts   requests.ts   progress.ts
  components/
    ui/          primitivas
    <domínio>/   componentes por área do produto
```

**Regra de fronteira:** nenhum componente de tela conversa com o Supabase diretamente.
Toda leitura e escrita passa por `server/`, que por sua vez consulta `lib/access/`. É isso
que impede a regra de autorização de se espalhar pelo código e apodrecer.

Cada módulo em `lib/` tem uma responsabilidade única e é testável isoladamente: `access/`
recebe usuário e curso e devolve o nível de acesso; `video/` recebe uma string e devolve
provedor e identificador; `storage/` recebe um arquivo e devolve um caminho.

### Variáveis de ambiente

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY     # servidor apenas
RESEND_API_KEY                # servidor apenas
EMAIL_FROM
NEXT_PUBLIC_SITE_URL
```

## 13. Segurança

- `SUPABASE_SERVICE_ROLE_KEY` existe apenas no servidor e nunca aparece numa variável
  com prefixo `NEXT_PUBLIC_`.
- **RLS habilitado em todas as tabelas**, com políticas espelhando a mesma regra de acesso.
  A aplicação é a primeira camada; o banco é a segunda. Um erro de programação deixa de ser
  um vazamento.
- Nenhum HTML fornecido por usuário é renderizado. Do snippet do VTurb extrai-se apenas o
  UUID; a descrição da aula é sanitizada na exibição. Sem isso, um líder mal-intencionado
  ou uma conta comprometida conseguiria executar script na sessão de todos os alunos.
- Toda server action valida a entrada com Zod e verifica o papel antes de agir. Não existe
  operação que confie no que a tela enviou.
- Links de download expiram em 60 segundos.
- Sessão em cookies `httpOnly` via `@supabase/ssr`; o `proxy.ts` do Next 16 protege as rotas
  por grupo, e cada página revalida a permissão do recurso específico.
- Usuário com `status = 'inactive'` perde acesso imediatamente, sem depender da expiração
  da sessão.

## 14. Tratamento de erros

Server actions devolvem um resultado tipado `{ ok: true, data } | { ok: false, error }`,
nunca uma exceção crua para a tela. A interface mostra o erro em toast, preservando o que
a pessoa digitou. Existem páginas dedicadas para 404 e para acesso negado — a de acesso
negado explica o motivo e oferece solicitar acesso quando cabível. Erros de servidor vão
para os logs da Vercel; monitoramento externo fica para depois do MVP.

## 15. Testes

**Vitest** para a lógica pura, com atenção desproporcional a `lib/access/`, que é onde um
erro custa caro. Casos cobertos: colaborador da área; colaborador de fora; colaborador com
liberação individual; líder na sua área; líder em área alheia; admin; curso em rascunho;
curso de onboarding; usuário inativo em cada um desses papéis. Também `lib/video/`, com as
variações de URL do YouTube, o snippet do VTurb e entradas inválidas.

**Playwright** em quatro fluxos de ponta a ponta:

1. Convite enviado, senha definida, primeiro login com a trilha inicial em destaque.
2. Colaborador sem acesso não alcança vídeo, anexo nem fórum — nem pela tela, nem pela URL
   direta, nem pela server action.
3. Líder cria curso, publica aula com vídeo e anexo, e o aluno da área vê o conteúdo.
4. Aluno pergunta, líder responde, a resposta aparece com selo de professor.

## 16. Identidade visual

Todas as cores, tipografia, raios e sombras ficam em tokens no CSS global. Até o kit da GEX
chegar (logo em SVG e PNG, paleta e tipografia), o projeto usa uma paleta neutra provisória
com uma cor de acento. Aplicar a identidade definitiva será trocar os tokens e os arquivos
de logo, sem tocar em componentes.

## 17. Dependências externas

- Projeto Supabase criado (Postgres, Auth e Storage).
- Conta Vercel e acesso ao DNS de `gexcorp.com.br` para apontar `academy`.
- Domínio verificado no Resend.
- Conta VTurb, para confirmar o formato real do snippet de incorporação.
- Kit de identidade visual da GEX.

Nenhuma dessas pendências bloqueia o início da implementação: o desenvolvimento local roda
com um projeto Supabase de desenvolvimento, e vídeo do YouTube cobre os testes enquanto o
VTurb não for confirmado.
