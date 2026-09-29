import Link from 'next/link'

/** O botão voltar da página do curso (spec, seção 7): círculo no canto, com o destino no rótulo acessível. */
export function VoltarCircular({ href, rotulo }: { href: string; rotulo: string }) {
  return (
    <Link
      href={href}
      aria-label={`Voltar para ${rotulo}`}
      title={`Voltar para ${rotulo}`}
      className="inline-grid h-10 w-10 place-items-center rounded-full border border-vidro-borda bg-vidro text-texto-suave backdrop-blur-md transition-colors hover:text-texto focus:outline-none focus-visible:ring-2 focus-visible:ring-acao"
    >
      <span aria-hidden className="text-lg leading-none">‹</span>
    </Link>
  )
}
