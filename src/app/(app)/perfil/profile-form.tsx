'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { createBrowserSupabase } from '@/lib/supabase/client'
import { updateProfile } from '@/server/account'

export function ProfileForm({
  fullName,
  avatarUrl,
}: {
  fullName: string
  avatarUrl: string | null
}) {
  const [state, action, saving] = useActionState(updateProfile, null)
  const [senhaMsg, setSenhaMsg] = useState<{ tipo: 'erro' | 'ok'; texto: string } | null>(null)
  const [trocando, setTrocando] = useState(false)

  async function trocarSenha(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSenhaMsg(null)

    // Capturado antes do primeiro await: o React zera event.currentTarget de
    // forma síncrona assim que o handler devolve o controle, então usá-lo
    // depois de um await (como fazia o `event.currentTarget.reset()` no fim
    // desta função) é sempre null e lança TypeError em toda troca de senha
    // bem-sucedida — uma promise rejeitada sem handler, silenciosa porque a
    // mensagem de sucesso já tinha sido definida antes da exceção.
    const formEl = event.currentTarget
    const form = new FormData(formEl)
    const senha = String(form.get('password'))
    if (senha.length < 8) {
      setSenhaMsg({ tipo: 'erro', texto: 'A senha precisa de ao menos 8 caracteres.' })
      return
    }
    if (senha !== String(form.get('confirm'))) {
      setSenhaMsg({ tipo: 'erro', texto: 'As senhas não conferem.' })
      return
    }

    setTrocando(true)
    const { error } = await createBrowserSupabase().auth.updateUser({ password: senha })
    setTrocando(false)
    setSenhaMsg(
      error
        ? { tipo: 'erro', texto: 'Não foi possível trocar a senha.' }
        : { tipo: 'ok', texto: 'Senha atualizada.' },
    )
    formEl.reset()
  }

  return (
    <div className="flex flex-col gap-8">
      <form action={action} className="flex flex-col gap-4 rounded-card border border-borda bg-superficie p-4">
        <h2 className="text-sm font-semibold">Seus dados</h2>
        <Field label="Nome completo" htmlFor="fullName">
          <Input id="fullName" name="fullName" defaultValue={fullName} required minLength={3} maxLength={120} />
        </Field>
        <Field label="URL da foto" htmlFor="avatarUrl" hint="Opcional">
          <Input id="avatarUrl" name="avatarUrl" type="url" defaultValue={avatarUrl ?? ''} />
        </Field>
        {state && !state.ok && (
          <p role="alert" className="text-xs text-perigo">
            {state.error}
          </p>
        )}
        {state?.ok && <p className="text-xs text-sucesso">Perfil salvo.</p>}
        <Button type="submit" disabled={saving} className="self-start">
          {saving ? 'Salvando…' : 'Salvar'}
        </Button>
      </form>

      <form onSubmit={trocarSenha} className="flex flex-col gap-4 rounded-card border border-borda bg-superficie p-4">
        <h2 className="text-sm font-semibold">Trocar senha</h2>
        <Field label="Nova senha" htmlFor="password" hint="Ao menos 8 caracteres">
          <Input id="password" name="password" type="password" required autoComplete="new-password" />
        </Field>
        <Field
          label="Repita a senha"
          htmlFor="confirm"
          error={senhaMsg?.tipo === 'erro' ? senhaMsg.texto : undefined}
        >
          <Input id="confirm" name="confirm" type="password" required autoComplete="new-password" />
        </Field>
        {senhaMsg?.tipo === 'ok' && <p className="text-xs text-sucesso">{senhaMsg.texto}</p>}
        <Button type="submit" variant="secundario" disabled={trocando} className="self-start">
          {trocando ? 'Trocando…' : 'Trocar senha'}
        </Button>
      </form>
    </div>
  )
}
