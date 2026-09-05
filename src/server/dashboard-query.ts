// Sem 'use server': lógica pura extraída de dashboard.ts para ficar
// testável sem cookies() — mesmo motivo documentado em forum-query.ts,
// catalog-query.ts, viewer-query.ts, courses-query.ts e
// access-requests-query.ts. Um arquivo 'use server' só pode exportar
// funções async; dashboard.ts (que roda com a chave de serviço — ver o
// comentário de getDashboard lá) fica só checando o usuário, consultando o
// banco e chamando montarPainel.
//
// Este é o maior bloco de lógica pura da fase: os números aqui são a base
// de decisão de um líder ou admin sobre pessoas de verdade. E, ao contrário
// do resto do projeto, para o líder NÃO há RLS sustentando "só a própria
// área" por baixo — dashboard.ts lê tudo pela chave de serviço porque
// `liberacoes_leitura` não deixaria o cliente da sessão do líder enxergar
// `course_access` de outras pessoas (ver o comentário lá). Isso faz de
// `visivelParaGestor`, abaixo, a ÚNICA barreira entre um líder e os dados de
// outra área — daí os testes deste arquivo cobrirem esse predicado com
// cuidado, inclusive o caso do líder sem área.
//
// `visivelParaGestor` delega em `podeGerenciarArea` (forum-query.ts): a
// revisão de fase 3 apontou que as duas, mais `pertenceAFilaDoLider`
// (também forum-query.ts), eram três cópias byte-a-byte da mesma regra —
// "admin, ou líder cuja área bate". Cada uma responde uma pergunta
// conceitualmente diferente (o nome de cada uma comunica qual), o que
// justifica manter os três nomes; não justificava manter a lógica
// reimplementada em três lugares.

import { canAccessCourse, type AccessCourse, type AccessUser } from '@/lib/access'
import { progressPercent } from '@/lib/progress/percent'
import { podeGerenciarArea } from './forum-query'

export type PersonProgress = {
  userId: string
  name: string
  areaName: string | null
  onboardingConcluido: boolean
  concluidas: number
  disponiveis: number
  percent: number
}

export type CourseStats = {
  courseId: string
  title: string
  areaName: string | null
  comAcesso: number
  concluiram: number
  percent: number
}

export const SELECT_PAINEL_PERFIS = 'id, full_name, role, area_id, status, areas(name)'
export const SELECT_PAINEL_CURSOS =
  'id, title, area_id, status, is_onboarding, areas(name), lessons(id, status)'
export const SELECT_PAINEL_LIBERACOES = 'user_id, course_id'
export const SELECT_PAINEL_AREAS_EXTRAS = 'user_id, area_id'
export const SELECT_PAINEL_PROGRESSO = 'user_id, lesson_id'

export type LinhaPerfilPainel = {
  id: string
  full_name: string
  role: string
  area_id: string | null
  status: string
  areas: { name: string } | null
}

export type LinhaCursoPainel = {
  id: string
  title: string
  area_id: string | null
  status: string
  is_onboarding: boolean
  areas: { name: string } | null
  lessons: { id: string; status: string }[]
}

export type LinhaLiberacaoPainel = { user_id: string; course_id: string }
export type LinhaAreaExtraPainel = { user_id: string; area_id: string }
export type LinhaProgressoPainel = { user_id: string; lesson_id: string }

/**
 * Área visível para quem está vendo o painel: admin enxerga qualquer área;
 * líder só quando a PRÓPRIA área não é nula e bate com `areaId`. Mesma regra
 * de `podeGerenciarArea` (forum-query.ts) e da ramificação 3 de
 * `canAccessCourse` — nome diferente porque a pergunta é outra ("o que este
 * painel mostra a quem gerencia", não "quem modera este fórum" ou "quem
 * edita este curso"), mas delega em vez de reimplementar (ver o comentário
 * no topo deste arquivo).
 *
 * A comparação com `null` é o ponto central: sem ela, `atual.areaId === null`
 * (um líder cadastrado sem área) casaria com QUALQUER linha sem área — e a
 * trilha de onboarding é justamente um curso sem área. `atual.areaId !==
 * null` fecha essa porta: um líder sem área não vê pessoa nem curso nenhum,
 * em vez de ver todo mundo e todo curso sem área. (`podeGerenciarArea` já
 * faz exatamente essa checagem — documentado lá.)
 */
export function visivelParaGestor(
  atual: { role: string; areaId: string | null },
  areaId: string | null,
): boolean {
  return podeGerenciarArea(atual, areaId)
}

/** Linha de `profiles` (SELECT_PAINEL_PERFIS) para o AccessUser que canAccessCourse espera. */
function paraAccessUser(perfil: LinhaPerfilPainel): AccessUser {
  return {
    id: perfil.id,
    role: perfil.role as AccessUser['role'],
    status: perfil.status as AccessUser['status'],
    areaId: perfil.area_id,
  }
}

/** Linha de `courses` (SELECT_PAINEL_CURSOS) para o AccessCourse que canAccessCourse espera. */
function paraAccessCourse(curso: LinhaCursoPainel): AccessCourse {
  return {
    id: curso.id,
    areaId: curso.area_id,
    status: curso.status as AccessCourse['status'],
    isOnboarding: curso.is_onboarding,
  }
}

/**
 * Monta o painel a partir das quatro coleções já lidas do banco (perfis
 * ativos, cursos com as aulas aninhadas, liberações avulsas e progresso de
 * todo mundo) — nenhuma rede aqui, só a conta.
 *
 * "Disponíveis" é calculado por PESSOA: para cada uma, quantas aulas
 * publicadas existem nos cursos que ELA acessa COMO ALUNO (`canAccessCourse`
 * devolvendo `'view'`, considerando área E liberação avulsa) — não a soma de
 * todas as aulas da plataforma, que puniria quem tem menos cursos liberados.
 * Por isso a busca de acesso por pessoa roda contra `linhasCursos` inteiro,
 * não contra a lista já recortada por área do gestor — uma liberação avulsa
 * para um curso de OUTRA área ainda soma aulas em `disponiveis`.
 *
 * Decisão de produto (revisão de fase 3, item 11): `'view'`, não `'manage'`
 * nem `!== 'none'` — um gestor não é aluno do curso que ele mesmo gerencia.
 * Antes, o denominador de cada pessoa incluía os cursos que ela GERENCIA
 * (`canAccessCourse` devolve `'manage'` pra esses), e como a lista ordena
 * por percentual crescente, um líder ou admin flutuava para o topo da tela
 * cuja função é mostrar QUEM ESTÁ ATRASADO — inflado por cursos que a
 * própria pessoa publica, não assiste. CONSEQUÊNCIA, para quem for reverter
 * esta decisão: um líder continua na lista pela trilha inicial e pelos
 * cursos de OUTRAS áreas que ele só acessa (nunca gerencia nenhum dos
 * dois), com um percentual que agora significa algo; um ADMIN, que gerencia
 * todo curso publicado de toda área (e enxerga até rascunho), fica com
 * `disponiveis: 0` sempre.
 *
 * `montarPainel` devolve `pessoas` INTEIRO, sem filtrar quem tem
 * `disponiveis: 0` — a correção de round 2 da revisão: a página
 * (/gerenciar/progresso) deriva a seção "Trilha inicial pendente" do MESMO
 * array `pessoas`, então um filtro aqui dentro sumiria com um admin que não
 * concluiu a trilha inicial daquela seção também, produzindo exatamente a
 * garantia confiante e errada ("Todo mundo concluiu a trilha inicial.") que
 * o item 5 existe para eliminar. Quem tem `disponiveis: 0` continua sendo
 * "ninguém a relatar" só para a seção "Por pessoa" — o filtro
 * `.filter((p) => p.disponiveis > 0)` mora lá, na página, não aqui.
 *
 * `onboardingConcluido` é verdadeiro só quando a trilha inicial existe,
 * está publicada, tem pelo menos uma aula publicada, e a pessoa concluiu
 * TODAS elas — nunca quando a trilha está vazia (`length > 0` evita "0 de 0
 * aulas" contar como concluído).
 */
export function montarPainel(
  atual: { role: string; areaId: string | null },
  linhasPerfis: readonly LinhaPerfilPainel[],
  linhasCursos: readonly LinhaCursoPainel[],
  linhasLiberacoes: readonly LinhaLiberacaoPainel[],
  linhasProgresso: readonly LinhaProgressoPainel[],
  linhasAreasExtras: readonly LinhaAreaExtraPainel[] = [],
): { pessoas: PersonProgress[]; cursos: CourseStats[] } {
  const aulasPorCurso = new Map<string, string[]>()
  for (const curso of linhasCursos) {
    aulasPorCurso.set(
      curso.id,
      curso.lessons.filter((l) => l.status === 'published').map((l) => l.id),
    )
  }

  const liberacoesPorUsuario = new Map<string, Set<string>>()
  for (const linha of linhasLiberacoes) {
    const atualSet = liberacoesPorUsuario.get(linha.user_id) ?? new Set<string>()
    atualSet.add(linha.course_id)
    liberacoesPorUsuario.set(linha.user_id, atualSet)
  }

  // Sem isto, quem tem área extra teria "disponíveis" menor do que a
  // realidade — o painel mostraria progresso alto sobre um denominador
  // incompleto, que é pior que mostrar número nenhum.
  const areasExtrasPorUsuario = new Map<string, Set<string>>()
  for (const linha of linhasAreasExtras) {
    const atualSet = areasExtrasPorUsuario.get(linha.user_id) ?? new Set<string>()
    atualSet.add(linha.area_id)
    areasExtrasPorUsuario.set(linha.user_id, atualSet)
  }

  const concluidasPorUsuario = new Map<string, Set<string>>()
  for (const linha of linhasProgresso) {
    const atualSet = concluidasPorUsuario.get(linha.user_id) ?? new Set<string>()
    atualSet.add(linha.lesson_id)
    concluidasPorUsuario.set(linha.user_id, atualSet)
  }

  const cursoOnboarding = linhasCursos.find((c) => c.is_onboarding && c.status === 'published')
  const aulasOnboarding = cursoOnboarding ? (aulasPorCurso.get(cursoOnboarding.id) ?? []) : []

  const listaPerfis = linhasPerfis.filter((p) => visivelParaGestor(atual, p.area_id))

  // INTEIRO: nenhum filtro por `disponiveis` aqui — ver o comentário de
  // montarPainel acima sobre por que esse filtro mora na página, não aqui.
  const pessoas: PersonProgress[] = listaPerfis.map((perfil) => {
    const usuario = paraAccessUser(perfil)
    const liberados = liberacoesPorUsuario.get(perfil.id) ?? new Set<string>()
    const areasExtras = areasExtrasPorUsuario.get(perfil.id) ?? new Set<string>()
    const concluidasDaPessoa = concluidasPorUsuario.get(perfil.id) ?? new Set<string>()

    // === 'view', não !== 'none': só conta como aluno, nunca como gestor —
    // ver o comentário de montarPainel acima.
    const aulasDisponiveis = linhasCursos
      .filter(
        (curso) =>
          canAccessCourse(usuario, paraAccessCourse(curso), liberados, areasExtras) === 'view',
      )
      .flatMap((curso) => aulasPorCurso.get(curso.id) ?? [])

    const concluidas = aulasDisponiveis.filter((id) => concluidasDaPessoa.has(id)).length

    return {
      userId: perfil.id,
      name: perfil.full_name,
      areaName: perfil.areas?.name ?? null,
      onboardingConcluido:
        aulasOnboarding.length > 0 && aulasOnboarding.every((id) => concluidasDaPessoa.has(id)),
      concluidas,
      disponiveis: aulasDisponiveis.length,
      percent: progressPercent(concluidas, aulasDisponiveis.length),
    }
  })

  const cursosVisiveis = linhasCursos.filter(
    (curso) => curso.status === 'published' && visivelParaGestor(atual, curso.area_id),
  )

  const cursosStats: CourseStats[] = cursosVisiveis.map((curso) => {
    const cursoAccess = paraAccessCourse(curso)
    const aulas = aulasPorCurso.get(curso.id) ?? []

    // `comAcesso` conta só as pessoas de `listaPerfis`, que para o líder já
    // está recortada na própria área (visivelParaGestor acima). Por isso,
    // NO MESMO curso, o líder pode ler "3 de 5" e o admin "3 de 12": uma
    // pessoa de OUTRA área com liberação avulsa a este curso entra na conta
    // do admin (que vê `listaPerfis` inteira) mas não na do líder. Isto é
    // intencional, não um defeito — o painel do líder responde "como está
    // a MINHA gente", não "quem no mundo tem acesso a este curso". Não
    // mude este cálculo para fazer as duas telas baterem.
    const comAcesso = listaPerfis.filter(
      (perfil) =>
        canAccessCourse(
          paraAccessUser(perfil),
          cursoAccess,
          liberacoesPorUsuario.get(perfil.id) ?? new Set<string>(),
          areasExtrasPorUsuario.get(perfil.id) ?? new Set<string>(),
        ) !== 'none',
    )

    // Curso sem nenhuma aula publicada: `aulas.every(...)` sobre um array
    // vazio devolveria `true` para QUALQUER pessoa (vacuamente), inflando
    // "concluiram" para o tamanho de `comAcesso` sem ninguém ter concluído
    // nada. O caso especial abaixo reporta 0 em vez disso, e
    // `progressPercent` já devolve 0 para `total <= 0`, então não há
    // divisão por zero em nenhum dos dois números.
    const concluiram =
      aulas.length === 0
        ? 0
        : comAcesso.filter((perfil) => {
            const concluidasDaPessoa = concluidasPorUsuario.get(perfil.id) ?? new Set<string>()
            return aulas.every((id) => concluidasDaPessoa.has(id))
          }).length

    return {
      courseId: curso.id,
      title: curso.title,
      areaName: curso.is_onboarding ? 'Trilha inicial' : (curso.areas?.name ?? null),
      comAcesso: comAcesso.length,
      concluiram,
      percent: progressPercent(concluiram, comAcesso.length),
    }
  })

  return {
    pessoas: pessoas.sort((a, b) => a.percent - b.percent),
    cursos: cursosStats.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')),
  }
}
