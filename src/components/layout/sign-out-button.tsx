'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createBrowserSupabase } from '@/lib/supabase/client'

/**
 * Não havia nenhum jeito de encerrar a sessão na aplicação (zero chamadas a
 * signOut em todo o código): todo teste manual precisava limpar cookies à
 * mão, e numa máquina compartilhada a sessão nunca expirava sozinha.
 */
export function SignOutButton() {
  const router = useRouter()
  const [saindo, setSaindo] = useState(false)

  async function sair() {
    setSaindo(true)
    await createBrowserSupabase().auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={sair}
      disabled={saindo}
      className="text-sm text-texto-suave underline hover:text-texto disabled:cursor-not-allowed disabled:opacity-50"
    >
      {saindo ? 'Saindo…' : 'Sair'}
    </button>
  )
}
