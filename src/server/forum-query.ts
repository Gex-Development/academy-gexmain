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

export const SELECT_PERGUNTAS =
  'id, body, is_pinned, resolved_at, created_at, author_id, profiles(full_name, role, area_id), answers(id, body, created_at, author_id, profiles(full_name, role, area_id))'

export type PerfilAutor = { full_name: string; role: string; area_id: string | null }
export type LinhaResposta = {
  id: string
  body: string
  created_at: string
  author_id: string
  profiles: PerfilAutor | null
}
export type LinhaPergunta = {
  id: string
  body: string
  is_pinned: boolean
  resolved_at: string | null
  created_at: string
  author_id: string
  profiles: PerfilAutor | null
  answers: LinhaResposta[]
}

/**
 * Selo "Professor": admin, ou líder cuja área bate com a área DO CURSO da
 * aula — não a área do autor "por si só" e não qualquer pessoa com acesso à
 * aula. Um perfil ausente (linha órfã, autor removido) nunca ganha o selo.
 */
function paraForumAuthor(id: string, perfil: PerfilAutor | null, areaIdDoCurso: string | null): ForumAuthor {
  return {
    id,
    name: perfil?.full_name ?? 'Colaborador',
    isInstructor: perfil ? podeGerenciarArea({ role: perfil.role, areaId: perfil.area_id }, areaIdDoCurso) : false,
  }
}

/**
 * Uma linha de `questions` (com `answers` aninhadas, ambas trazendo o
 * `profiles` do autor) vira um ForumQuestion pronto para a tela.
 *
 * `podeModerar` chega decidido por quem chama (a mesma regra que
 * podeGerenciarArea calcula para o usuário da sessão) em vez de ser
 * recalculado aqui por linha — é uma propriedade de QUEM ESTÁ VENDO, igual
 * para toda pergunta da lista, diferente do selo (que é do AUTOR de cada
 * linha).
 */
export function paraForumQuestion(
  row: LinhaPergunta,
  userId: string,
  podeModerar: boolean,
  areaIdDoCurso: string | null,
): ForumQuestion {
  return {
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    isPinned: row.is_pinned,
    resolved: row.resolved_at !== null,
    author: paraForumAuthor(row.author_id, row.profiles, areaIdDoCurso),
    canEdit: row.author_id === userId,
    canModerate: podeModerar,
    answers: [...row.answers]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((a) => ({
        id: a.id,
        body: a.body,
        createdAt: a.created_at,
        author: paraForumAuthor(a.author_id, a.profiles, areaIdDoCurso),
        canEdit: a.author_id === userId || podeModerar,
      })),
  }
}
