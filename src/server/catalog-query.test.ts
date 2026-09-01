import { describe, expect, it } from 'vitest'
import type { AccessUser } from '@/lib/access'
import { montarCatalogo, paraCatalogItem, type LinhaCatalogo } from './catalog-query'

function linha(over: Partial<LinhaCatalogo> = {}): LinhaCatalogo {
  return {
    id: 'c1',
    slug: 'curso-1',
    title: 'Curso 1',
    description: null,
    cover_url: null,
    status: 'published',
    is_onboarding: false,
    area_id: 'area-trafego',
    position: 0,
    areas: { name: 'Tráfego', slug: 'trafego', color: '#2f6bff', position: 0, cover_url: null },
    ...over,
  }
}

// Colaborador de uma área diferente da do curso — o caso "vitrine mostra,
// conteúdo não": vê o card, não abre o curso.
const bloqueado: AccessUser = { id: 'u1', role: 'member', status: 'active', areaId: 'area-outra' }

describe('paraCatalogItem — contagem de aulas independe do acesso', () => {
  it('curso bloqueado mantém a contagem vinda da RPC — não zera, não vem da linha de lessons', () => {
    const aulasPorCurso = new Map([['c1', 5]])
    const item = paraCatalogItem(linha(), bloqueado, aulasPorCurso, new Map(), new Set(), new Set())
    expect(item.access).toBe('none')
    expect(item.lessonCount).toBe(5)
  })

  it('curso sem entrada no mapa (nenhuma aula publicada) mostra 0, não erro', () => {
    const item = paraCatalogItem(linha(), bloqueado, new Map(), new Map(), new Set(), new Set())
    expect(item.lessonCount).toBe(0)
  })

  it('liberação individual muda o acesso para "view" sem alterar a contagem', () => {
    const aulasPorCurso = new Map([['c1', 2]])
    const item = paraCatalogItem(linha(), bloqueado, aulasPorCurso, new Map(), new Set(['c1']), new Set())
    expect(item.access).toBe('view')
    expect(item.lessonCount).toBe(2)
  })

  it('marca requestStatus "pending" quando o curso está no conjunto de solicitações', () => {
    const item = paraCatalogItem(linha(), bloqueado, new Map(), new Map(), new Set(), new Set(['c1']))
    expect(item.requestStatus).toBe('pending')
  })

  it('carrega a posição do curso e da área, para a vitrine poder honrar a ordem manual', () => {
    const item = paraCatalogItem(
      linha({ position: 7, areas: { name: 'Tráfego', slug: 'trafego', color: null, position: 3, cover_url: null } }),
      bloqueado,
      new Map(),
      new Map(),
      new Set(),
      new Set(),
    )
    expect(item.position).toBe(7)
    expect(item.areaPosition).toBe(3)
  })

  it('CatalogItem nunca carrega campo de aula, vídeo ou anexo — só as chaves do tipo', () => {
    const item = paraCatalogItem(linha(), bloqueado, new Map([['c1', 3]]), new Map(), new Set(), new Set())
    expect(Object.keys(item).sort()).toEqual(
      [
        'access',
        'areaColor',
        'areaCoverUrl',
        'areaId',
        'areaName',
        'areaPosition',
        'areaSlug',
        'coverUrl',
        'description',
        'id',
        'isOnboarding',
        'lessonCount',
        'position',
        'progress',
        'requestStatus',
        'slug',
        'title',
      ].sort(),
    )
  })
})

describe('paraCatalogItem — progresso acompanha o acesso, não a matrícula', () => {
  const liberado: AccessUser = { id: 'u2', role: 'member', status: 'active', areaId: 'area-trafego' }

  it('curso sem nenhuma aula concluída: progresso é 0 de N', () => {
    const aulasPorCurso = new Map([['c1', 8]])
    const item = paraCatalogItem(linha(), liberado, aulasPorCurso, new Map(), new Set(), new Set())
    expect(item.progress).toEqual({ completed: 0, total: 8, percent: 0 })
  })

  it('curso parcialmente concluído: progresso reflete completed/total, com percentual arredondado', () => {
    const aulasPorCurso = new Map([['c1', 3]])
    const concluidasPorCurso = new Map([['c1', 1]])
    const item = paraCatalogItem(linha(), liberado, aulasPorCurso, concluidasPorCurso, new Set(), new Set())
    expect(item.progress).toEqual({ completed: 1, total: 3, percent: 33 })
  })

  // Curso bloqueado: a pessoa não tem o que concluir nele, então "completed"
  // é 0 — mas "total" continua vindo da contagem real de aulas (a mesma que
  // popula lessonCount para o card mostrar "N aulas"), não zero. É assim na
  // prática: concluidasPorCurso vem de um select em lesson_progress com
  // `lessons!inner(course_id)` (ver catalog.ts) — e a política lessons_leitura
  // barra essa junção para quem não acessa o curso, então a linha nunca chega
  // ao mapa. Passar aqui um concluidasPorCurso vazio para o curso bloqueado
  // reproduz esse estado real; o mapa NÃO fica ausente por decisão de
  // paraCatalogItem, e sim porque o dado nunca chega até ele — quem esconde a
  // barra de progresso de um curso bloqueado é o `item.access !== 'none'` em
  // course-card.tsx, não um zeramento aqui.
  it('curso bloqueado: nada concluído (a pessoa não tem o que concluir), total continua sendo a contagem real', () => {
    const aulasPorCurso = new Map([['c1', 8]])
    const item = paraCatalogItem(linha(), bloqueado, aulasPorCurso, new Map(), new Set(), new Set())
    expect(item.access).toBe('none')
    expect(item.lessonCount).toBe(8)
    expect(item.progress).toEqual({ completed: 0, total: 8, percent: 0 })
  })
})

describe('montarCatalogo — separação e agrupamento', () => {
  it('vitrine vazia: nenhuma trilha inicial, nenhum grupo', () => {
    expect(montarCatalogo([])).toEqual({ onboarding: null, grupos: [] })
  })

  it('separa a trilha inicial dos grupos por área', () => {
    const trilha = paraCatalogItem(
      linha({ id: 'o1', is_onboarding: true, area_id: null, areas: null }),
      bloqueado,
      new Map(),
      new Map(),
      new Set(),
      new Set(),
    )
    const curso = paraCatalogItem(linha({ id: 'c1' }), bloqueado, new Map(), new Map(), new Set(), new Set())

    const catalogo = montarCatalogo([trilha, curso])
    expect(catalogo.onboarding?.id).toBe('o1')
    expect(catalogo.grupos).toHaveLength(1)
    expect(catalogo.grupos[0]!.items.map((i) => i.id)).toEqual(['c1'])
  })

  it('curso sem área (fora da trilha inicial) cai no grupo "Outros"', () => {
    const orfao = paraCatalogItem(
      linha({ id: 'x1', area_id: null, areas: null }),
      bloqueado,
      new Map(),
      new Map(),
      new Set(),
      new Set(),
    )
    const catalogo = montarCatalogo([orfao])
    expect(catalogo.grupos.map((g) => g.areaName)).toEqual(['Outros'])
  })

  // Caso de controle antigo (posição e alfabeto concordando) não prova nada
  // sobre qual critério a ordenação usa de fato — por isso os três testes
  // abaixo deliberadamente colocam posição e ordem alfabética em conflito.
  describe('ordem por posição administrada (areas.position / courses.position), nome como desempate', () => {
    it('grupos de área seguem areaPosition, mesmo contra a ordem alfabética', () => {
      // "Zoologia" (posição 0) vem antes de "Agropecuária" (posição 1) — o
      // oposto da ordem alfabética. Sob o sort antigo (só localeCompare no
      // nome), este teste falharia.
      const zebra = paraCatalogItem(
        linha({
          id: 'z1',
          title: 'Zebra',
          area_id: 'area-zoologia',
          areas: { name: 'Zoologia', slug: 'zoologia', color: null, position: 0, cover_url: null },
        }),
        bloqueado,
        new Map(),
        new Map(),
        new Set(),
        new Set(),
      )
      const abelha = paraCatalogItem(
        linha({
          id: 'a1',
          title: 'Abelha',
          area_id: 'area-agropecuaria',
          areas: { name: 'Agropecuária', slug: 'agropecuaria', color: null, position: 1, cover_url: null },
        }),
        bloqueado,
        new Map(),
        new Map(),
        new Set(),
        new Set(),
      )

      const catalogo = montarCatalogo([abelha, zebra])
      expect(catalogo.grupos.map((g) => g.areaName)).toEqual(['Zoologia', 'Agropecuária'])
    })

    it('cursos dentro de um grupo seguem a position do curso, mesmo contra a ordem alfabética do título', () => {
      // "Zeta" (position 0) vem antes de "Alfa" (position 1) — o oposto do
      // que localeCompare(title) sozinho decidiria.
      const zeta = paraCatalogItem(linha({ id: 'z1', title: 'Zeta', position: 0 }), bloqueado, new Map(), new Map(), new Set(), new Set())
      const alfa = paraCatalogItem(linha({ id: 'a1', title: 'Alfa', position: 1 }), bloqueado, new Map(), new Map(), new Set(), new Set())

      const catalogo = montarCatalogo([alfa, zeta])
      expect(catalogo.grupos).toHaveLength(1)
      expect(catalogo.grupos[0]!.items.map((i) => i.title)).toEqual(['Zeta', 'Alfa'])
    })

    it('empate de position cai no desempate por nome/título em pt-BR', () => {
      const zebraTrafego = paraCatalogItem(
        linha({
          id: 'z1',
          title: 'Zebra',
          area_id: 'area-trafego',
          areas: { name: 'Tráfego', slug: 'trafego', color: null, position: 0, cover_url: null },
        }),
        bloqueado,
        new Map(),
        new Map(),
        new Set(),
        new Set(),
      )
      const abelhaDesign = paraCatalogItem(
        linha({
          id: 'a1',
          title: 'Abelha',
          area_id: 'area-design',
          areas: { name: 'Design', slug: 'design', color: null, position: 0, cover_url: null },
        }),
        bloqueado,
        new Map(),
        new Map(),
        new Set(),
        new Set(),
      )
      const catalogoDeGrupos = montarCatalogo([zebraTrafego, abelhaDesign])
      expect(catalogoDeGrupos.grupos.map((g) => g.areaName)).toEqual(['Design', 'Tráfego'])

      const zeta = paraCatalogItem(linha({ id: 'z2', title: 'Zeta', position: 5 }), bloqueado, new Map(), new Map(), new Set(), new Set())
      const alfa = paraCatalogItem(linha({ id: 'a2', title: 'Alfa', position: 5 }), bloqueado, new Map(), new Map(), new Set(), new Set())
      const catalogoDeItens = montarCatalogo([zeta, alfa])
      expect(catalogoDeItens.grupos[0]!.items.map((i) => i.title)).toEqual(['Alfa', 'Zeta'])
    })

    it('grupo "Outros" (sem área, sem posição de admin) vai sempre por último', () => {
      // Área com position alta (99) ainda vem antes de "Outros", que não tem
      // position nenhuma para honrar.
      const comArea = paraCatalogItem(
        linha({ id: 'c1', title: 'Curso Com Área', areas: { name: 'Zoologia', slug: 'zoologia', color: null, position: 99, cover_url: null } }),
        bloqueado,
        new Map(),
        new Map(),
        new Set(),
        new Set(),
      )
      const orfao = paraCatalogItem(
        linha({ id: 'x1', title: 'Curso Órfão', area_id: null, areas: null }),
        bloqueado,
        new Map(),
        new Map(),
        new Set(),
        new Set(),
      )
      const catalogo = montarCatalogo([orfao, comArea])
      expect(catalogo.grupos.map((g) => g.areaName)).toEqual(['Zoologia', 'Outros'])
    })

    // Achado da revisão de fase: areas.name não tem constraint de unicidade
    // nenhuma (só areas.slug tem), e updateArea nunca toca o slug — então
    // renomear uma área para o nome de outra já existente não dá erro.
    // Agrupar pelo NOME (como o código fazia antes) fundiria os cursos das
    // duas sob um único cabeçalho; agrupar por areaId não.
    it('duas áreas com o mesmo nome (colisão via renomeação) geram grupos distintos, em ordem de posição', () => {
      const cursoAreaAntiga = paraCatalogItem(
        linha({
          id: 'c1',
          title: 'Curso Área Antiga',
          area_id: 'area-1',
          areas: { name: 'Design', slug: 'design', color: null, position: 0, cover_url: null },
        }),
        bloqueado,
        new Map(),
        new Map(),
        new Set(),
        new Set(),
      )
      const cursoAreaRenomeada = paraCatalogItem(
        linha({
          id: 'c2',
          title: 'Curso Área Renomeada',
          area_id: 'area-2',
          areas: { name: 'Design', slug: 'design', color: null, position: 1, cover_url: null },
        }),
        bloqueado,
        new Map(),
        new Map(),
        new Set(),
        new Set(),
      )

      // Ordem de chegada deliberadamente invertida em relação à posição —
      // um agrupamento por nome (que colide) dependeria de qual item chega
      // primeiro no Map; por areaId, cada área tem seu próprio grupo e a
      // ordenação por areaPosition decide sozinha.
      const catalogo = montarCatalogo([cursoAreaRenomeada, cursoAreaAntiga])
      expect(catalogo.grupos).toHaveLength(2)
      expect(catalogo.grupos.map((g) => g.areaName)).toEqual(['Design', 'Design'])
      expect(catalogo.grupos.map((g) => g.groupKey)).toEqual(['area-1', 'area-2'])
      expect(catalogo.grupos[0]!.items.map((i) => i.id)).toEqual(['c1'])
      expect(catalogo.grupos[1]!.items.map((i) => i.id)).toEqual(['c2'])
    })
  })
})
