import Link from 'next/link'

export function HeroBanner({
  rotulo,
  titulo,
  subtitulo,
  coverUrl,
  color,
  href,
  textoBotao,
}: {
  rotulo: string
  titulo: string
  subtitulo: string
  coverUrl: string | null
  color: string | null
  href: string
  textoBotao: string
}) {
  // Mesma cadeia de três degraus de area-card.tsx (item 3 da revisão de
  // branch, estendida aqui numa rodada seguinte): imagem → cor da área →
  // gradiente da marca. Ficou de fora na primeira passada porque o item 4a
  // (capaDoCurso) só passou a alimentar este banner com capa de curso real
  // depois — e essa capa é nula na maioria dos casos hoje (o banco real não
  // tem trilha inicial), então este é o banner que mais gente vê sem capa
  // nenhuma.
  //
  // from-ciano to-azul (não from-azul to-ciano) na direção `to-r`: testei
  // primeiro azul→ciano (espelhando a ordem vertical de area-card.tsx) e
  // achei um buraco real — com um título de 79 caracteres (dentro do limite
  // de 120 de courses.title) num viewport de 700px, o texto se estende até
  // ~91% da largura da seção, onde o overlay abaixo já afinou para ~27% e a
  // ponta ciano composta cai para 3,48:1, abaixo do mínimo. O motivo:
  // aquela ordem colocava a cor ARRISCADA (ciano, 1,88:1 cru) sob a
  // proteção MAIS FRACA do overlay (20% no fim), o oposto do que
  // area-card.tsx faz sem querer (lá o overlay é mais forte exatamente
  // onde a base fica mais clara). Invertendo — ciano à esquerda, onde o
  // overlay começa em 90%, azul à direita, onde ele cai a 20% mas azul cru
  // já passa sozinho (7,82:1) —, o pior ponto de toda a largura (~90%) dá
  // 10,07:1: seguro em qualquer extensão de texto, não só na largura
  // "típica". Números recalculados depois da troca; ver o comentário do
  // overlay abaixo para a extração completa.
  const semReserva = !coverUrl && !color

  return (
    <section
      className={`relative overflow-hidden rounded-card border border-borda ${
        semReserva ? 'bg-gradient-to-r from-ciano to-azul' : 'bg-capa-fundo'
      }`}
      style={color && !coverUrl ? { backgroundColor: color } : undefined}
    >
      {coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}
      {/*
        Gradiente da esquerda para a direita: o texto fica sobre a parte
        escura. Também é a garantia de contraste do degrau 3 da reserva
        acima (from-ciano to-azul, ver o comentário lá para o porquê da
        ordem): composto com este overlay (90%→60%→20% preto, da esquerda
        para a direita), o pior ponto em TODA a largura da seção — não só
        onde o texto costuma ficar — dá 10,07:1 contra texto branco (medido
        em x≈90%, onde a base já é quase azul puro e o overlay já afinou
        para ~27%; nos dois extremos o número é maior ainda: ~18,8:1 em
        x=0%, ~10,2:1 em x=100%). Se um dia este overlay virar condicional
        a `coverUrl` (para não escurecer uma capa que já é escura o
        bastante, por exemplo), o degrau 3 volta a ficar exposto sem nenhum
        teste avisando — conferir de novo antes, e não restaurar a ordem
        antiga (from-azul to-ciano) sem recalcular: essa ordem tem um ponto
        real abaixo de 4,5:1 com título comprido, documentado acima.
      */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-black/20" />

      <div className="relative flex min-h-56 flex-col justify-end gap-1 p-6 sm:min-h-64 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-widest text-ciano">{rotulo}</p>
        <h1 className="max-w-xl text-2xl font-bold leading-tight text-white sm:text-3xl">{titulo}</h1>
        <p className="max-w-xl text-sm text-white/80">{subtitulo}</p>
        <Link
          href={href}
          className="mt-4 w-fit rounded-card bg-acao px-5 py-2 text-sm font-semibold text-acao-texto focus:outline-none focus:ring-2 focus:ring-acao focus:ring-offset-2"
        >
          ▶ {textoBotao}
        </Link>
      </div>
    </section>
  )
}
