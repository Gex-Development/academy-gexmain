import { DefinirSenhaForm } from '../definir-senha-form'

export const metadata = { title: 'Nova senha — GEX Academy' }

export default function NovaSenhaPage() {
  return (
    <>
      <p className="mb-4 text-sm text-texto-suave">Escolha uma nova senha.</p>
      <DefinirSenhaForm ativarConta={false} />
    </>
  )
}
