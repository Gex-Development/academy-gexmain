import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { CHAVE_TEMA } from '@/lib/tema/tema'
import './globals.css'

export const metadata: Metadata = {
  title: 'GEX Academy',
  description: 'Plataforma de ensino interna da GEX.',
}

/*
 * Roda de forma síncrona antes da primeira pintura. Sem isto, quem escolheu
 * o tema claro vê um lampejo escuro a cada carregamento, porque o HTML chega
 * do servidor sem saber a preferência (ela mora no navegador da pessoa).
 * Espelha temaInicial() de src/lib/tema/tema.ts — mantenha as duas iguais.
 */
const SCRIPT_TEMA = `(function(){try{var t=localStorage.getItem('${CHAVE_TEMA}');if(t!=='light'){document.documentElement.classList.add('dark')}}catch(e){document.documentElement.classList.add('dark')}})()`

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: o SCRIPT_TEMA acima muda a classe do <html>
    // antes do React hidratar. Sem isto o React acusa divergência entre o
    // HTML do servidor (sem "dark") e o DOM já corrigido pelo script.
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
