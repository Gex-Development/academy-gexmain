'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { createBrowserSupabase } from '@/lib/supabase/client'
import { activateAccount } from '@/server/account'

export function DefinirSenhaForm({ ativarConta }: { ativarConta: boolean }) {
  const router = useRouter()
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErro(null)

    const form = new FormData(event.currentTarget)
    const senha = String(form.get('password'))
    const confirmacao = String(form.get('confirm'))

    if (senha.length < 8) {
      setErro('A senha precisa de ao menos 8 caracteres.')
      return
    }
    if (senha !== confirmacao) {
      setErro('As senhas não conferem.')
      return
    }

    setEnviando(true)
    const supabase = createBrowserSupabase()
    const { error } = await supabase.auth.updateUser({ password: senha })

    if (error) {
      setErro('Não foi possível salvar a senha. Abra o link do e-mail novamente.')
      setEnviando(false)
      return
    }

    if (ativarConta) await activateAccount()

    router.replace('/')
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="Nova senha" htmlFor="password" hint="Ao menos 8 caracteres">
        <Input id="password" name="password" type="password" required autoComplete="new-password" />
      </Field>
      <Field label="Repita a senha" htmlFor="confirm" error={erro ?? undefined}>
        <Input id="confirm" name="confirm" type="password" required autoComplete="new-password" />
      </Field>
      <Button type="submit" disabled={enviando}>
        {enviando ? 'Salvando…' : 'Salvar senha'}
      </Button>
    </form>
  )
}
