import { cn } from '@/lib/cn'
import type { ButtonHTMLAttributes } from 'react'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primario' | 'secundario' | 'perigo'
}

export function Button({ variant = 'primario', className, ...props }: Props) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition',
        'disabled:cursor-not-allowed disabled:opacity-50',
        // bg-acao/text-acao-texto (não bg-marca-600/text-white): o par acao
        // INVERTE entre os temas para ficar legível nos dois — no escuro
        // marca-600 é o ciano #01cdff, que dá 1,88:1 com branco (falha o
        // mínimo de 4,5:1 da WCAG). hover:opacity-90 em vez de trocar o tom
        // de fundo, para não desfazer o par acao/acao-texto no hover.
        variant === 'primario' && 'bg-acao text-acao-texto hover:opacity-90',
        variant === 'secundario' &&
          'border border-borda bg-superficie text-texto hover:bg-fundo',
        // Mesmo raciocínio do primário: bg-perigo/text-perigo-texto, par que
        // também inverte por tema (ver o comentário em globals.css).
        variant === 'perigo' && 'bg-perigo text-perigo-texto hover:opacity-90',
        className,
      )}
      {...props}
    />
  )
}
