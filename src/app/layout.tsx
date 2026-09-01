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

/*
 * Caveat dos docs do Next (node_modules/next/dist/docs/01-app/02-guides/
 * preventing-flash-before-hydration.md, seção "Re-applying attributes in
 * development"): em dev, o remonte único do Strict Mode reseta <html>,
 * <head> e <body> para só os atributos que o React gerencia via JSX,
 * apagando o que um script combinado tivesse setado. Investigado nesta
 * versão (reactStrictMode é true por padrão aqui, e não há
 * reactStrictMode: false em next.config.ts): não reproduz, porque este
 * <html> não declara `className` no JSX — só `lang` e
 * `suppressHydrationWarning` — então não há atributo "gerenciado" para o
 * remonte resetar. Conferido no navegador: document.documentElement.className
 * continua "dark" depois de recarregar em dev, em mais de uma tentativa.
 */

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
