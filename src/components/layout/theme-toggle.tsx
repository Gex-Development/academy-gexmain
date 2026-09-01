'use client'

import { useEffect, useState } from 'react'
import { CHAVE_TEMA, temaInicial, type Tema } from '@/lib/tema/tema'

export function ThemeToggle() {
  // Começa em null para o servidor e o cliente renderizarem a mesma coisa na
  // primeira passada; a preferência real só existe no navegador.
  const [tema, setTema] = useState<Tema | null>(null)

  useEffect(() => {
    // Sincroniza com localStorage, que só existe no cliente — por isso a
    // leitura não pode entrar no useState acima sem quebrar a primeira
    // passada igual entre servidor e cliente descrita no comentário acima.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTema(temaInicial(localStorage.getItem(CHAVE_TEMA)))
  }, [])

  function alternar() {
    const novo: Tema = tema === 'light' ? 'dark' : 'light'
    setTema(novo)
    localStorage.setItem(CHAVE_TEMA, novo)
    document.documentElement.classList.toggle('dark', novo === 'dark')
  }

  const paraEscuro = tema !== 'dark'

  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={paraEscuro ? 'Usar tema escuro' : 'Usar tema claro'}
      className="rounded-card px-2 py-1 text-sm text-texto-suave hover:bg-fundo hover:text-texto focus:outline-none focus:ring-2 focus:ring-acao"
    >
      <span aria-hidden>{paraEscuro ? '☾' : '☀'}</span>
    </button>
  )
}
