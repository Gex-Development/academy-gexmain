# GEX Academy — Redesenho das telas do aluno

**Data:** 29/09/2026
**Escopo:** as quatro telas que todo colaborador usa — Início, Área, Curso e Aula — e a barra do topo.
**Base:** fase 4 (vitrine por área, `docs/superpowers/specs/2026-09-01-gex-academy-vitrine-design.md`).

## 1. O problema

A plataforma funciona, mas o visual parece amador. A inspiração Netflix da fase 4 continua valendo; a execução não chegou lá. Três causas concretas, observadas nas telas atuais:

- **Não há fonte carregada.** Tudo sai na fonte do sistema, que muda de computador para computador e não tem personalidade nenhuma.
- **As superfícies são planas.** Fundo liso, cards com borda cinza, sem profundidade — a mesma cara de qualquer protótipo.
- **A home não leva ao curso.** Ela mostra áreas; o curso fica sempre um clique mais longe, e o que a pessoa estava assistindo só aparece no banner.

Referências trazidas pelo dono do produto:

1. **O sistema interno da GEX** (painel de Funis) — dá a **pele**: azul-marinho profundo, superfícies de vidro com borda fina azulada, brilho ciano sutil.
2. **A área de membros de outra plataforma** (curso "Do Zero a Investidor") — dá a **estrutura**: saudação grande, filtros em pílula por progresso, card horizontal grande com progresso e botão, página de curso com banner enorme.

Sucesso é: um colaborador abre e a sensação é de produto profissional, não de protótipo; e acha o que precisa assistir mais rápido que hoje.

## 2. O que já existe e não muda

- **Regra de acesso.** `canAccessCourse` e o espelho SQL `can_access_course` decidem tudo; nenhuma tela nova decide acesso por conta própria. Curso bloqueado continua visível e clicável, para pedir acesso.
- **Tema por tokens.** Nenhum componente cita cor literal nem usa `dark:`. O tema claro é o bloco `@theme` de `globals.css`; o escuro é `:root.dark`, que redefine os mesmos tokens. A pele nova entra **só** por esse caminho.
- **Rotas.** `/`, `/area/[slug]`, `/curso/[slug]`, `/curso/[slug]/aula/[lessonSlug]` continuam as mesmas.
- **Telas de gestão.** Cursos, Pessoas, Áreas, Solicitações, Dúvidas e Progresso mantêm o layout; herdam cores e fonte novas pelos tokens, sem serem tocadas.
- **Capas.** Mesmas dimensões e mesmo fluxo de upload (área 1600×1000, curso 1280×800).
- **Link de voltar** das telas internas (`<Voltar>`), com destino fixo.

## 3. Decisões tomadas

Todas escolhidas pelo dono do produto sobre mockups no navegador (`.superpowers/brainstorm/`), com as capas reais.

| Decisão | Escolha | Alternativas descartadas |
|---|---|---|
| Escopo | Só as telas do aluno | Navegação do app inteiro; tudo incluindo gestão |
| Estrutura da home | **C** — destaque "continue" + uma fileira por área | A: grade de áreas; B: lista de cursos sem área |
| Pele | **A · Vidro GEX** | B: cinema (preto neutro, capa de fundo); C: híbrido com luz ambiente desfocada |
| Aulas na página do curso | **Lista de episódios** | Cards em grade |
| Página da aula | **Sala de aula** — vídeo + lista lateral + abas | Coluna única |
| Busca e filtros | **Só filtros** agora | Filtros e busca; nenhum |
| Tema claro | **Mantido, adaptado** | Só escuro nas telas do aluno; remover |

Dois detalhes apontados pelo dono na pele A viram regra do sistema inteiro: a **barra de progresso em degradê** azul→ciano, e o **item selecionado com contorno ciano translúcido** em vez de preenchimento sólido.

## 4. Sistema visual

### 4.1 Tokens novos

Definidos nos dois temas, no mesmo esquema de `globals.css`:

| Token | Escuro | Claro |
|---|---|---|
| fundo da página | degradê radial: `#0e2a55` no topo-esquerda → `#081429` → `#050a16` | `#f3f6fb`, liso |
| trama | pontos brancos a 3,5% de opacidade, grade de 18px | nenhuma |
| vidro (superfície) | degradê vertical de branco 6% → 1,5%, com desfoque de fundo | branco sólido |
| vidro-borda | `rgba(120,170,255,.16)` | `#dbe6f5` |
| selecionado | fundo ciano 16%, contorno ciano 50%, texto `#d8f6ff` | fundo azul 8%, contorno azul, texto azul |
| progresso | degradê `#004EAC → #01CDFF` | o mesmo degradê |
| brilho | sombra ciano difusa sob o card de destaque | sombra neutra suave |

Os valores do escuro são os dos mockups aprovados. Os do claro são ponto de partida: o critério que manda é o contraste da seção 4.4.

### 4.2 Onde o vidro aparece — e só aí

- card "Continue de onde parou"
- lista de episódios da página do curso
- lista lateral da sala de aula
- barra do topo

Capas de curso e de área **não** ganham vidro: já têm imagem, e vidro sobre imagem é o "vidro em tudo" que as diretrizes de design listam como vício de interface gerada por IA.

### 4.3 Fonte

**Geist**, carregada pelo `next/font` do próprio Next.js — sem link externo, sem variação entre máquinas. Antes de escrever o carregamento, ler o guia em `node_modules/next/dist/docs/` (regra do `AGENTS.md`: esta versão do Next tem APIs diferentes das conhecidas).

### 4.4 Contraste

Toda combinação nova de texto sobre fundo passa pelo teste de contraste que já existe (lê estilos computados nos dois temas), estendido aos tokens novos. Mínimo 4,5:1 para texto de corpo.

O ciano sobre fundo claro dá ~1,6:1 — ilegível. Por isso, **no claro**, selecionado e botões usam o azul; o ciano aparece só como detalhe sobre imagem. É o mesmo desenho que o projeto já adota hoje com `--color-acao`.

## 5. Início

De cima para baixo:

1. **Saudação** — "Olá, William", grande.
2. **Filtros em pílula** — Tudo / Continuar / Não iniciados / Concluídos (seção 9.2). O ativo usa o token `selecionado`.
3. **Destaque** — card de vidro com a capa do curso, rótulo "Continue de onde parou", título do curso, "Aula N de M", barra de progresso e botão **Continuar**, que leva direto à aula. A escolha de o que destacar continua em `escolherDestaque`:
   - trilha inicial com acesso e ainda não concluída → a trilha, com botão **Começar** (ou **Continuar**, se já começou);
   - sem trilha pendente, com aula a retomar → esse curso, botão **Continuar**;
   - sem nenhum dos dois → o destaque não aparece.
4. **Uma fileira por área**, na ordem de `position` e nome:
   - título da fileira = nome da área, com **Ver tudo →** para `/area/[slug]`;
   - cursos lado a lado, rolando na horizontal;
   - cada curso é um card (seção 8.1);
   - área sem curso publicado aparece com um único card **"Em breve"**, para continuar visível como hoje.

Com um filtro ativo diferente de Tudo, os cursos das fileiras são filtrados; **fileira que fica vazia some**, e o card "Em breve" também. Se nenhuma fileira sobra, uma mensagem diz que não há cursos naquele filtro.

O filtro age **só nas fileiras**. O destaque não muda com ele: "continue de onde parou" é a resposta a "o que eu faço agora", e escondê-lo porque o filtro é "Concluídos" tiraria da tela justamente a ação mais útil.

A trilha inicial continua fora das fileiras de área: ela é curso, não área.

## 6. Página da área

- Botão voltar para o Início.
- Banner com a capa da área, nome e contagem de cursos (mesma reserva de capa de hoje quando não há imagem).
- Cursos em **grade**, usando o **mesmo card** das fileiras da home.
- Área sem curso: o estado vazio de hoje ("Nenhum curso publicado nesta área ainda").

## 7. Página do curso

- Botão voltar **circular**, no canto superior esquerdo, para a área (ou Início, se trilha).
- **Banner** grande com a capa do curso (reserva na seção 9.4), escurecido da esquerda para a direita para o texto ler:
  - rótulo: área · N aulas;
  - título e descrição;
  - "X de N" com barra de progresso;
  - botão conforme o estado (seção 9.1): **Começar**, **Continuar aula N** ou **Rever curso**.
- **Lista de episódios** em superfície de vidro, cada aula com:
  - número;
  - miniatura (capa do curso);
  - título e duração (quando cadastrada);
  - selo **Concluída**, **Assistindo** ou **Não iniciada**;
  - a aula "Assistindo" com fundo `selecionado` e filete ciano à esquerda.

Curso bloqueado continua caindo na tela de curso bloqueado (`LockedCourse`), com a pele nova.

## 8. Página da aula — sala de aula

Em tela larga, duas colunas:

- **Esquerda:**
  - vídeo;
  - título da aula, "Aula N de M · duração";
  - **Concluir** (a ação de marcar como concluída de hoje) e **Próxima ›**;
  - abas **Sobre / Materiais · N / Dúvidas · N** — o conteúdo de cada aba é o que hoje aparece empilhado: descrição, anexos e fórum.
- **Direita:** lista das aulas do curso em vidro, com progresso no topo e a aula atual destacada. Cada item leva à aula.

Em tela estreita, a lista desce para baixo do vídeo.

As abas seguem o padrão acessível de abas (setas do teclado, `aria-selected`, painel associado). Todo conteúdo é renderizado no servidor; a aba só alterna o que está visível.

### 8.1 Card de curso (componente compartilhado)

Usado nas fileiras da home e na grade da área:

- capa 16:10 (reserva na seção 9.4);
- título, número de aulas;
- barra de progresso só se a pessoa já começou;
- bloqueado: esmaecido, com cadeado, e continua clicável.

## 9. Regras de dados

### 9.1 A próxima aula

**A próxima aula é a primeira não concluída, na ordem do curso.** Função pura, testada, e a única fonte para três lugares que precisam concordar:

- o botão do banner do curso;
- o selo "Assistindo" na lista de episódios;
- o destaque na lista lateral da sala de aula.

| Situação | Botão | Selo "Assistindo" |
|---|---|---|
| nenhuma concluída | Começar (aula 1) | aula 1 |
| algumas concluídas | Continuar aula N | aula N |
| todas concluídas | Rever curso (aula 1) | nenhuma |
| curso sem aula publicada | sem botão | nenhuma |

### 9.2 Filtros

Função pura, testada. Sobre os cursos do catálogo:

| Filtro | Entra |
|---|---|
| Tudo | todos, inclusive bloqueados |
| Continuar | com acesso, 0 < concluídas < total |
| Não iniciados | com acesso, total > 0, nenhuma concluída |
| Concluídos | com acesso, total > 0, todas concluídas |

**Curso bloqueado só aparece em Tudo**: não faz sentido listar em "Não iniciados" algo que a pessoa nem pode abrir.

O filtro viaja na URL (`/?filtro=continuar`), lido pela página no servidor: funciona sem JavaScript, dá para mandar o link, e o voltar do navegador desfaz o filtro. Valor desconhecido na URL = Tudo.

### 9.3 "Aula N de M" no destaque

`getContinueWatching` hoje devolve título e endereço do curso e da aula. Passa a devolver também a **posição** da aula no curso e o **total** de aulas publicadas.

### 9.4 Capa do curso e reserva

Nesta ordem:

1. a capa do próprio curso;
2. a capa da área do curso;
3. o degradê de reserva que já existe.

Com isso a vitrine fica apresentável antes de cada curso ganhar arte própria — hoje nenhum curso tem capa.

### 9.5 Duração

Já existe por aula e é opcional. Aula sem duração não mostra o campo; o total do curso soma só as que têm.

## 10. Fronteira do escopo

Fica **fora**, de propósito — cada um pode virar etapa própria:

- busca;
- módulos dentro do curso;
- capa por aula;
- redesenho das telas de gestão e admin;
- barra lateral de navegação no lugar da barra do topo;
- seletor de tema com as duas opções lado a lado (adiado antes).

## 11. Entrega em etapas

Cada etapa funciona sozinha e pode ir ao ar:

1. **Tokens, fonte e barra do topo** — a plataforma inteira já muda de cara, inclusive a gestão.
2. **Início** — filtros, destaque, fileiras por área, card de curso compartilhado.
3. **Área.**
4. **Curso** — banner, próxima aula, lista de episódios.
5. **Aula** — sala de aula e abas.

## 12. Critérios de sucesso

- As quatro telas seguem os mockups aprovados, nos dois temas.
- Toda combinação de texto passa 4,5:1 nos dois temas, medido pelo teste de contraste.
- As regras 9.1 e 9.2 têm teste próprio cobrindo: curso sem aula, curso bloqueado, curso todo concluído, filtro desconhecido.
- A suíte existente continua passando (unitários, banco, E2E rodados spec a spec).
- Captura de tela de cada tela, nos dois temas, em desktop e celular, conferida antes da entrega.
- Nenhum componente cita cor literal nem usa `dark:`.
- As telas de gestão continuam funcionando sem terem sido editadas.

## 13. Riscos

- **Vidro caro em celular fraco.** Desfoque de fundo pesa em GPU modesta. Mitigação: vidro só nos quatro lugares da seção 4.2, nunca em lista longa rolando.
- **Tema claro sem a mágica do escuro.** Brilho, trama e vidro não existem no claro; ele pode parecer mais simples. Aceito: coerência vale mais que efeito.
- **Rolagem horizontal escondendo curso.** Quem não percebe que a fileira rola não vê o quarto curso. Mitigação: "Ver tudo →" em toda fileira, e o card seguinte cortado na borda para sugerir continuidade.
- **Capas repetidas.** Enquanto os cursos não tiverem capa própria, cursos da mesma área mostram a mesma imagem (reserva 9.4). A lista de episódios usa a capa do curso como miniatura de todas as aulas pelo mesmo motivo.
