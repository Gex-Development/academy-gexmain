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
        variant === 'primario' && 'bg-marca-600 text-white hover:bg-marca-700',
        variant === 'secundario' &&
          'border border-borda bg-superficie text-texto hover:bg-fundo',
        variant === 'perigo' && 'bg-perigo text-white hover:opacity-90',
        className,
      )}
      {...props}
    />
  )
}
