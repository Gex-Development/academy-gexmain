import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-lg font-semibold">Página não encontrada</h1>
      <p className="max-w-sm text-sm text-texto-suave">
        O endereço não existe, ou o conteúdo não está disponível para você.
      </p>
      <Link href="/" className="text-sm text-marca-600 hover:underline">
        Voltar ao início
      </Link>
    </div>
  )
}
