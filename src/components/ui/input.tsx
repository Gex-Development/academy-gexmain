import { cn } from '@/lib/cn'
import type { InputHTMLAttributes } from 'react'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full rounded-lg border border-borda bg-superficie px-3 py-2 text-sm',
        // ring-acao, não ring-marca-100: no escuro marca-100 é #12324f, que
        // dá 1,24:1 contra a superfície (#221f20) — o anel de foco some,
        // sobra só a borda. acao já inverte certo entre os temas.
        'outline-none focus:border-marca-500 focus:ring-2 focus:ring-acao',
        className,
      )}
      {...props}
    />
  )
}
