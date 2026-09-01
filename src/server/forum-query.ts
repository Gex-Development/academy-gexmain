// Sem 'use server': lógica pura (a decisão do selo "Professor"/moderação e o
// mapeamento de linha) extraída para ficar testável sem depender de
// cookies() — mesmo motivo documentado em courses-query.ts, catalog-query.ts,
// viewer-query.ts e attachments-query.ts. Um arquivo 'use server' só pode
// exportar funções async.
//
// podeGerenciarArea espelha as ramificações 2 e 3 de canAccessCourse
// (src/lib/access/can-access-course.ts): admin gerencia qualquer área; líder
// gerencia a própria. Não chama canAccessCourse diretamente porque ela
// decide sobre um CURSO (status, trilha inicial, liberação individual) — bom
// para "este usuário pode ver/editar ESTE curso", mas as duas perguntas que
// este arquivo precisa responder são outras: "o AUTOR de uma pergunta/
// resposta é professor desta área?" (o selo, calculado por linha de
// `profiles`, sem curso nenhum à mão) e "quem está vendo pode moderar este
// fórum?" (podeModerar, em forum.ts). Fabricar um AccessCourse com
// status/liberações que não vêm ao caso só para reaproveitar canAccessCourse
// seria mais confuso do que esta função pequena e dedicada — mesma escolha
// que attachments-query.ts fez para podeVerAnexosDaAula, uma decisão nova
// que não cabia em nenhuma função já existente.
//
// Só role/areaId aqui — status é responsabilidade de quem chama. Para
// podeModerar (o usuário da sessão), contextoDaAula já garante status
// 'active' antes de chegar aqui. Para o selo (o AUTOR de uma linha, uma
// pessoa que pode ter sido desativada depois de publicar), quem monta o
// ForumAuthor precisa considerar o status À PARTE — ver paraForumAuthor.
export function podeGerenciarArea(
  pessoa: { role: string; areaId: string | null },
  areaIdDoCurso: string | null,
): boolean {
  return (
    pessoa.role === 'admin' ||
    (pessoa.role === 'leader' && pessoa.areaId !== null && pessoa.areaId === areaIdDoCurso)
  )
}

export type ForumAuthor = { id: string; name: string; isInstructor: boolean }
export type ForumAnswer = {
  id: string
  body: string
  createdAt: string
  author: ForumAuthor
  canEdit: boolean
}
export type ForumQuestion = {
  id: string
  body: string
  createdAt: string
  isPinned: boolean
  resolved: boolean
  author: ForumAuthor
  answers: ForumAnswer[]
  canEdit: boolean
  canModerate: boolean
}

// Sem embed de `profiles(...)` de propósito: `profiles` só tem política de
// leitura para o próprio perfil, para admin, e para líder dentro da própria
// área (0001_schema_inicial.sql) — um colega comum lendo a pergunta de outra
// pessoa não tem NENHUMA política que libere ler o perfil de quem
// respondeu, e um embed aqui voltaria `null` para todo autor que não fosse
// quem está olhando (achado real desta tarefa, coberto em
// tests/db/forum.test.ts). Por isso `questions`/`answers` continuam lidas
// pelo cliente da SESSÃO em listQuestions (RLS sustenta o conteúdo, como em
// todo outro lugar do projeto) e os perfis dos autores chegam à parte, numa
// segunda busca pela chave de serviço, restrita aos author_id que apareceram
// — ver o comentário em forum.ts sobre essa busca.
export const SELECT_PERGUNTAS =
  'id, body, is_pinned, resolved_at, created_at, author_id, answers(id, body, created_at, author_id)'

// Forma da linha que a busca estreita de perfis (`profiles.select('id,
// full_name, role, area_id, status').in('id', ids)`, em forum.ts) devolve.
// `status` entra aqui porque o selo considera ele — ver paraForumAuthor.
export type PerfilAutor = { full_name: string; role: string; area_id: string | null; status: string }
export type PerfisPorId = ReadonlyMap<string, PerfilAutor>

export type LinhaResposta = {
  id: string
  body: string
  created_at: string
  author_id: string
}
export type LinhaPergunta = {
  id: string
  body: string
  is_pinned: boolean
  resolved_at: string | null
  created_at: string
  author_id: string
  answers: LinhaResposta[]
}

/**
 * Selo "Professor": admin ATIVO, ou líder ATIVO cuja área bate com a área DO
 * CURSO da aula — não a área do autor "por si só" e não qualquer pessoa com
 * acesso à aula. Um líder desativado depois de responder não continua
 * ostentando o selo (autoridade é derivada do estado ATUAL, nunca gravada —
 * ver contextoDaAula em forum.ts para a mesma ideia aplicada a quem
 * modera). Um perfil ausente do Map (não deveria acontecer — author_id
 * referencia profiles com ON DELETE CASCADE, então a linha do fórum some
 * junto — mas defensivo mesmo assim) nunca ganha o selo.
 */
function paraForumAuthor(id: string, perfis: PerfisPorId, areaIdDoCurso: string | null): ForumAuthor {
  const perfil = perfis.get(id)
  return {
    id,
    name: perfil?.full_name ?? 'Colaborador',
    isInstructor:
      perfil !== undefined &&
      perfil.status === 'active' &&
      podeGerenciarArea({ role: perfil.role, areaId: perfil.area_id }, areaIdDoCurso),
  }
}

/**
 * Uma linha de `questions` (com `answers` aninhadas) vira um ForumQuestion
 * pronto para a tela.
 *
 * `perfis` chega pronto (id → perfil) de uma busca separada — ver o
 * comentário de SELECT_PERGUNTAS. `podeModerar` chega decidido por quem
 * chama (a mesma regra que podeGerenciarArea calcula para o usuário da
 * sessão) em vez de ser recalculado aqui por linha — é uma propriedade de
 * QUEM ESTÁ VENDO, igual para toda pergunta da lista, diferente do selo
 * (que é do AUTOR de cada linha, via `perfis`).
 */
export function paraForumQuestion(
  row: LinhaPergunta,
  userId: string,
  podeModerar: boolean,
  areaIdDoCurso: string | null,
  perfis: PerfisPorId,
): ForumQuestion {
  return {
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    isPinned: row.is_pinned,
    resolved: row.resolved_at !== null,
    author: paraForumAuthor(row.author_id, perfis, areaIdDoCurso),
    canEdit: row.author_id === userId,
    canModerate: podeModerar,
    answers: [...row.answers]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((a) => ({
        id: a.id,
        body: a.body,
        createdAt: a.created_at,
        author: paraForumAuthor(a.author_id, perfis, areaIdDoCurso),
        canEdit: a.author_id === userId || podeModerar,
      })),
  }
}

// --- Fila de dúvidas do líder (src/server/forum.ts#listPendingQuestions) ---
//
// Mesmo motivo de tudo acima: listPendingQuestions mora num módulo
// 'use server', que só pode exportar async — o tipo da linha crua, o filtro
// por área e o mapeamento para a tela ficam aqui para serem testáveis sem
// cookies().

export type PendingQuestion = {
  id: string
  body: string
  createdAt: string
  authorName: string
  lessonTitle: string
  courseTitle: string
  courseSlug: string
  lessonSlug: string
  answerCount: number
}

// Sem embed de `profiles(full_name)` de propósito — mesmo achado documentado
// acima em SELECT_PERGUNTAS: quem pergunta pode ser de outra área (é para
// isso que existe a liberação individual de curso), e `profiles_leitura_lider`
// só libera os perfis da PRÓPRIA área do líder. O embed voltaria `null`
// justamente para o aluno de fora da área, escondendo quem perguntou sem
// erro nenhum. O nome vem à parte, por buscarPerfisAutores, igual a
// listQuestions.
export const SELECT_FILA_DUVIDAS =
  'id, body, created_at, author_id, answers(id), lessons!inner(title, slug, courses!inner(title, slug, area_id))'

export type LinhaFilaDuvidas = {
  id: string
  body: string
  created_at: string
  author_id: string
  answers: { id: string }[]
  lessons: {
    title: string
    slug: string
    courses: { title: string; slug: string; area_id: string | null }
  }
}

/**
 * Defesa em profundidade: `perguntas_leitura` (0005_endurece_politicas.sql)
 * já limita o que chega do banco por `can_manage_course` — mais permissiva
 * que isto, porque também libera quem só TEM ACESSO ao curso (liberação
 * individual), não só quem gerencia. A fila do líder é mais estreita: só a
 * área que ele de fato gerencia, nunca um curso de outra área que ele
 * enxerga por liberação avulsa. Um filtro extra e barato aqui garante isso
 * mesmo se o RLS um dia mudar.
 *
 * Mesma forma de podeGerenciarArea (acima): `areaId !== null` explícito
 * antes de comparar. Sem essa guarda, um líder sem área própria (admin
 * cadastrou sem área) bateria `null === null` com QUALQUER curso sem área —
 * e a trilha de onboarding é exatamente um curso sem área. `role ===
 * 'leader'` explícito também, mais estreito que "não-admin": correto porque
 * listPendingQuestions já devolve `[]` para member antes de chegar aqui,
 * então nada de legítimo se perde, e esta função deixa de depender de quem
 * a chama para estar certa.
 */
export function pertenceAFilaDoLider(
  pessoa: { role: string; areaId: string | null },
  areaIdDoCurso: string | null,
): boolean {
  return (
    pessoa.role === 'admin' ||
    (pessoa.role === 'leader' && pessoa.areaId !== null && pessoa.areaId === areaIdDoCurso)
  )
}

/** Uma linha de `questions` (com aula/curso aninhados) vira um PendingQuestion pronto para a tela. */
export function paraPendingQuestion(row: LinhaFilaDuvidas, perfis: PerfisPorId): PendingQuestion {
  return {
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    authorName: perfis.get(row.author_id)?.full_name ?? 'Colaborador',
    lessonTitle: row.lessons.title,
    courseTitle: row.lessons.courses.title,
    courseSlug: row.lessons.courses.slug,
    lessonSlug: row.lessons.slug,
    answerCount: row.answers.length,
  }
}
