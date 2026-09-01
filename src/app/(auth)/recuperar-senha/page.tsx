'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { createBrowserSupabase } from '@/lib/supabase/client'

export default function RecuperarSenhaPage() {
  const [enviado, setEnviado] = useState(false)
  const [enviando, setEnviando] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setEnviando(true)

    const form = new FormData(event.currentTarget)
    const supabase = createBrowserSupabase()
    await supabase.auth.resetPasswordForEmail(String(form.get('email')).trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/auth/confirm?next=/nova-senha`,
    })

    // Sempre confirma o envio: dizer que o e-mail não existe revela quem
    // trabalha na empresa para quem estiver testando endereços.
    setEnviado(true)
    setEnviando(false)
  }

  if (enviado) {
    return (
      <p className="text-sm text-texto-suave">
        Se houver uma conta com esse e-mail, o link de recuperação já está a caminho.
      </p>
    )
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="E-mail" htmlFor="email">
        <Input id="email" name="email" type="email" required />
      </Field>
      <Button type="submit" disabled={enviando}>
        {enviando ? 'Enviando…' : 'Enviar link'}
      </Button>
    </form>
  )
}
