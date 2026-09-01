import Link from 'next/link'

export function HeroBanner({
  rotulo,
  titulo,
  subtitulo,
  coverUrl,
  href,
  textoBotao,
}: {
  rotulo: string
  titulo: string
  subtitulo: string
  coverUrl: string | null
  href: string
  textoBotao: string
}) {
  return (
    <section
      className="relative overflow-hidden rounded-card border border-borda"
      style={coverUrl ? undefined : { backgroundColor: '#004EAC' }}
    >
      {coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}
      {/* Gradiente da esquerda para a direita: o texto fica sobre a parte escura. */}
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
