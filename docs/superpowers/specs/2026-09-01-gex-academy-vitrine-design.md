# GEX Academy — Vitrine por área e identidade visual

**Data:** 2026-09-01
**Fase:** 4 (primeira depois do MVP)
**Spec anterior:** `docs/superpowers/specs/2026-08-31-gex-academy-design.md`

## 1. O problema

O MVP entrega uma home que lista **todos os cursos**, agrupados por área, em cards de
tamanho igual. Funciona com 6 cursos e desmonta com 40: o colaborador de Copy precisa
rolar por Tráfego, Infraestrutura e Back-End para chegar no que é dele, e a plataforma
não comunica que a empresa tem áreas de conhecimento distintas.

A vitrine passa a ser **por área**. A home mostra as áreas; a área mostra seus cursos.

Junto vem a identidade visual: o MVP usa um azul provisório escolhido por falta de manual
de marca. As cores oficiais da GEX chegaram e entram agora, com tema escuro e claro.

## 2. O que já existe e não muda

Curso, aula, vídeo, anexo, progresso, fórum, fila de dúvidas, solicitação de acesso e
painel de acompanhamento continuam com o mesmo comportamento. A tela onde o líder sobe
aula continua igual.

**Nada nesta fase altera a regra de quem acessa o quê.** `canAccessCourse` e as políticas
de RLS ficam intactas. O estado de "área bloqueada" descrito na §5 é **derivado** do acesso
por curso que já existe — não é permissão nova, não é coluna nova, não tem política nova.

## 3. Decisões tomadas

Registradas com o motivo, inclusive as que contrariaram a recomendação — o produto é do
William, e quem ler isto depois precisa saber o que foi escolha e o que foi omissão.

| Decisão | Escolha | Motivo |
|---|---|---|
| Nível abaixo de área | Nenhum: "copy de VSL" é **curso** | O modelo atual já serve. Um nível a mais mexeria no banco, na tela de gestão e na regra de acesso, para resolver um problema que ainda não existe. |
| Topo da home | Banner que se adapta à pessoa | Usa progresso e trilha inicial, que a plataforma já tem. Não exige curadoria de ninguém, então não apodrece. |
| Capa da área | Imagem, com a cor como reserva | Escolha do William. Fica próximo da referência (Netflix) e custa pouco: o projeto já trata capa como URL colada num campo, sem upload. |
| Carrossel na home | Não | Com 5-8 áreas tudo cabe na tela. Carrossel esconderia metade atrás de uma seta para resolver um problema de escala que não existe. |
| Área sem acesso | Escurecida com cadeado | **Escolha do William, contra a recomendação.** A recomendação era um contador ("1 de 4 liberados") porque o acesso é por curso e o cadeado na área mente nos dois sentidos: some quando ainda há curso bloqueado, e aparece em área que a pessoa pode explorar. Ele preferiu o visual e registrou como reversível. |
| Página da área | Fileira "continue" + grade | Fileiras por situação ("não começou"/"concluído") ficam com buracos numa área de 6 cursos, e embaralham a ordem que o líder configurou. A barra de progresso na capa já conta a mesma história. |
| Tema padrão | Escuro | Pedido original, e o que combina com a referência. |
| Preferência de tema | No navegador | `localStorage`. Segue o dispositivo, não a pessoa. Virar coluna no perfil é fácil depois; construir agora seria adiantar trabalho sem demanda. |

As três linhas abaixo não são decisão de produto — são desvio encontrado na revisão de branch da fase 4 (2026-09-01), registrado aqui em vez de corrigido às cegas, seguindo a mesma disciplina.

| Cabeçalho de `/area/[slug]` | Mostra nome e contagem de cursos, não a descrição da área | A §6 pede "nome da área e descrição". `areas.description` nunca foi levado até `CatalogItem` — `SELECT_CATALOGO` (catalog-query.ts) não seleciona a coluna. Consequência real: o admin edita a descrição de uma área e nenhuma tela de aluno mostra o resultado. |
| Ordem da fileira "Continue de onde parou" em `/area/[slug]` | Preserva a ordem que o catálogo já define (posição do curso), não a atividade mais recente | A §6 pede "ordenados pela atividade mais recente". `selecionarEmAndamento` (vitrine-query.ts) só filtra, de propósito — há teste ("preserva a ordem de entrada — é filtro, não reordenação") travando esse comportamento. Ordenar por atividade exigiria trazer `completed_at` por curso, hoje fora do catálogo. |
| Destino do botão do banner "Comece por aqui" (trilha inicial) | Aponta para `/curso/[slug]` (o índice do curso), não para a próxima aula não concluída | A §5.1.1 pede a próxima aula não concluída. `CatalogItem` carrega só a CONTAGEM de aulas (progress.completed/total), não a lista nem quais estão concluídas — por decisão de catalog.ts ("nada aqui toca aula"). Resolver certo exige uma consulta nova nesta página (ex.: `getCourseView` do curso da trilha). Fica pendente de aprovação do controlador antes de abrir essa consulta, não implementado nem contornado. |

## 4. Rotas

```
/                       home — banner + grade de áreas          [reescrita]
/area/[slug]            cursos de uma área                      [nova]
/curso/[slug]           capa do curso                           [sem mudança]
/curso/[slug]/aula/...  player e aula                           [sem mudança]
```

## 5. A home

### 5.1 Banner

Ocupa o topo, com imagem de fundo, gradiente escuro da esquerda para a direita e um botão.
Três estados, nesta ordem de prioridade:

1. **Trilha inicial não concluída** — rótulo "COMECE POR AQUI", título e descrição da
   trilha, botão *Começar* (ou *Continuar*, se já iniciada) apontando para a próxima aula
   não concluída. Imagem de fundo: a capa da trilha.
2. **Trilha concluída e algum curso em andamento** — rótulo "CONTINUE DE ONDE PAROU",
   título da aula, nome do curso, botão *Continuar*. Imagem: a capa do curso.
3. **Nada em andamento** — sem banner. A home abre direto na saudação e na grade. Não se
   inventa destaque: banner falso é pior que ausência de banner.

Reaproveita `getContinueWatching()` e o item de onboarding que `getCatalog()` já devolve.

### 5.2 Grade de áreas

Todas as áreas visíveis de uma vez, sem carrossel, em grade responsiva (3 colunas em tela
larga, 2 em tablet, 1 em telefone). Cada capa mostra imagem, nome da área e contagem de
cursos.

**A contagem inclui os cursos bloqueados.** "6 cursos" significa seis cursos publicados
naquela área, independente do que a pessoa pode abrir — é a informação que faz ela querer
pedir acesso. Contar só os liberados faria a mesma área mostrar números diferentes para
pessoas diferentes, e um "1 curso" numa área que tem seis.

**A capa de área não mostra barra de progresso.** Uma área é um punhado de cursos com
progressos distintos, e qualquer número único ali seria uma média sem significado. Progresso
aparece na capa do curso, onde tem sentido.

**Quais áreas aparecem:** as que têm ao menos um curso publicado. Uma área sem curso
publicado não vira capa — capa que leva a uma página vazia é pior que capa nenhuma. Como
consequência, uma área recém-criada só aparece quando o líder publica o primeiro curso.

**A trilha inicial** entra como primeira capa fixa da grade, rotulada como tal, para quem
já concluiu conseguir revisitar. Ela não tem área no banco (`area_id` nulo) e por isso não
sai do agrupamento normal. Sua imagem é a capa do próprio curso de onboarding
(`courses.cover_url`); sem ela, cai na cor de reserva como qualquer área. O clique leva
direto a `/curso/[slug]` — a trilha é um curso, não uma área, e não ganha página
intermediária.

**Ordem:** trilha inicial primeiro, depois as áreas por `areas.position` (o campo "Ordem na
vitrine" que já existe em `/admin/areas`), com o nome como desempate.

**Fonte dos dados:** a home deriva tudo de `getCatalog()`, que já devolve todo curso
publicado com `access` calculado por curso, incluindo os bloqueados. Agrupar por área e
contar é trabalho de função pura — **nenhuma consulta nova, nenhuma decisão de acesso
nova.**

### 5.3 Estado de bloqueio da capa de área

Uma área aparece **escurecida com cadeado** quando a pessoa não tem acesso a **nenhum**
curso publicado dela — ou seja, quando todo curso daquela área tem `access === 'none'`.
Basta um curso liberado (pela área da pessoa ou por liberação avulsa) para a capa aparecer
normal.

A capa bloqueada **continua clicável**. A pessoa entra, vê o que existe lá e pode pedir
acesso — que é o fluxo que a fase 3 construiu.

## 6. A página da área

`/area/[slug]`. Acessível a qualquer pessoa ativa: ela mostra capas e contagens, nunca
conteúdo de aula. O que a pessoa não pode acessar aparece com cadeado, exatamente como o
catálogo do MVP já faz.

**Topo:** faixa com a capa da área em largura total, gradiente para baixo, nome da área e
descrição. Altura menor que o banner da home — é cabeçalho, não destaque.

**Fileira "Continue de onde parou":** só os cursos **desta área** que a pessoa começou e
não terminou, ordenados pela atividade mais recente. Omitida quando vazia.

**Grade "Todos os cursos":** todos os cursos publicados da área, na ordem
`courses.position` que o líder configurou. Cada capa traz título, contagem de aulas, barra
de progresso quando iniciado, e cadeado quando `access === 'none'`.

**Área vazia ou inexistente:** slug que não existe → 404. Área que existe mas perdeu todos
os cursos publicados → a página abre com o cabeçalho e uma linha explicando que ainda não
há curso publicado ali.

## 7. Tema escuro e claro

### 7.1 Como funciona

O projeto já tem a propriedade que torna isto barato: **nenhum componente cita cor
literal.** Tudo sai de tokens declarados em `@theme` no `src/app/globals.css`. Tema escuro
é redefinir o valor dos tokens sob uma classe `.dark` na raiz do documento — as telas de
gestão, admin, fórum e player acompanham sem serem tocadas.

Regra que a fase precisa manter: **componente nenhum ganha cor literal nem variante
`dark:`.** Se uma tela precisa de cor diferente no escuro, o token é que muda.

### 7.2 Padrão, troca e persistência

Escuro é o padrão. Um botão no topo alterna, e a escolha fica em `localStorage`.

Um script mínimo e síncrono no `<head>` lê a preferência antes da primeira pintura e aplica
a classe. Sem ele, quem escolheu claro vê um lampejo escuro a cada carregamento.

### 7.3 A paleta

Cada cor da marca tem uma função, e ela **inverte** entre os temas. O motivo é contraste:
`#01CDFF` sobre branco é ilegível; sobre `#221F20` é excelente.

| Papel | Escuro | Claro |
|---|---|---|
| Fundo da página | `#131213` | `#F5F6F8` |
| Superfície (topo, cards, campos) | `#221F20` | `#FFFFFF` |
| Borda | `#353133` | `#E2E5EA` |
| Texto | `#F4F3F4` | `#221F20` |
| Texto suave | `#A09DA0` | `#5F5B5D` |
| Ação (botão, link, foco) | `#01CDFF` com texto `#221F20` | `#004EAC` com texto branco |
| Destaque (progresso, selo, rótulo) | `#01CDFF` | `#004EAC` |

`#01CDFF` no tema claro só decora sobre fundo escuro — barra de progresso dentro de uma
capa, rótulo sobre imagem. Nunca texto sobre branco.

Perigo, sucesso e aviso mantêm os tokens que já existem, ajustados para contraste no fundo
escuro.

### 7.4 A logo

O arquivo é silhueta de cor única, então uma cópia serve os dois temas, tingida por CSS:
clara no escuro, `#221F20` no claro. Entra no topo, substituindo o texto "GEX Academy" que
está lá hoje.

## 8. Capas: dimensões visíveis para quem sobe

O projeto trata capa como URL colada num campo — não há upload. O campo ganha, ao lado, um
retângulo de proporção correta que **declara a medida** enquanto está vazio, e mostra a
prévia da imagem quando preenchido.

| Onde | Medida | Proporção |
|---|---|---|
| Capa de área | 1600 × 1000 px | 16:10 |
| Capa de curso | 1280 × 800 px | 16:10 |

Mesma proporção nos dois de propósito: quem faz a arte não precisa lembrar de dois
formatos. O texto do campo avisa que **o essencial deve ficar no centro**, porque no topo
da página da área a imagem é cortada em faixa.

A prévia usa a mesma proporção e o mesmo corte da tela real, para o problema aparecer na
hora de subir, não depois.

## 9. Mudanças no banco

Uma migration, uma coluna:

```sql
alter table public.areas add column cover_url text;
```

Sem política nova: `areas_leitura` já libera leitura a qualquer pessoa ativa, e
`areas_escrita` já restringe escrita a admin.

## 10. Mudanças nas telas de gestão

- `/admin/areas` — o formulário ganha o campo "URL da capa", com o retângulo de medida da §8.
- `/gerenciar/cursos/[id]` — o campo de capa que já existe ganha o mesmo retângulo.

Nada mais muda em gestão ou admin. Elas recebem o tema novo pelos tokens e mantêm o layout:
são ferramenta de trabalho, não vitrine.

## 11. Fronteira do escopo

**Dentro:** home, página da área, tema escuro/claro em todo o sistema, paleta da marca,
logo, coluna `areas.cover_url`, campos de capa com medida.

**Fora:** redesenho de layout das telas de gestão e admin; upload de imagem (capa continua
sendo URL); nível de categoria abaixo de área; preferência de tema por pessoa em vez de por
navegador; busca; qualquer mudança na regra de acesso.

## 12. Critérios de sucesso

1. Um colaborador de Copy abre a home, vê as áreas da empresa e chega aos cursos de Copy em
   um clique.
2. Um colaborador novo abre a home e a primeira coisa que vê é a trilha inicial, com botão
   para começar.
3. Uma área onde a pessoa não tem nenhum curso liberado aparece escurecida com cadeado, e
   ainda assim abre, permitindo pedir acesso.
4. O botão de tema alterna escuro e claro em qualquer tela do sistema, inclusive gestão,
   admin e fórum, e a escolha sobrevive a um recarregamento sem lampejo.
5. Quem vai cadastrar uma capa lê a medida exata antes de fazer a arte.
6. Nenhum teste de acesso existente muda de resultado — a fase não toca em permissão.

## 13. Riscos

**O cadeado na área mente.** Registrado na §3 como decisão consciente. O sintoma vai ser um
colaborador dizendo "abri Tráfego achando que estava tudo liberado e só um curso abriu", ou
"a área estava com cadeado mas eu consegui ver um curso". A correção, se acontecer, é trocar
o cadeado pelo contador — mudança de uma tela, sem migration.

**Áreas sem capa.** Enquanto ninguém cadastrar imagem, a home inteira cai na cor da área. É
o comportamento desenhado, mas significa que a plataforma só fica com o visual pretendido
depois que alguém subir 5-8 imagens. Vale tratar isso como parte da entrega, não como
"depois".

**Contraste do ciano.** A regra da §7.3 é fácil de violar sem perceber, porque `#01CDFF`
sobre branco *parece* bonito em tela grande e some em tela de notebook com brilho baixo. A
revisão da fase precisa procurar por isso.
