import { DefinirSenhaForm } from '../definir-senha-form'

export const metadata = { title: 'Bem-vindo — GEX Academy' }

export default function ConvitePage() {
  return (
    <>
      <p className="mb-4 text-sm text-texto-suave">
        Bem-vindo à GEX Academy. Defina sua senha para entrar.
      </p>
      <DefinirSenhaForm ativarConta />
    </>
  )
}
