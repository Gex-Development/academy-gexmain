import { cn } from '@/lib/cn'
import type { InputHTMLAttributes } from 'react'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full rounded-lg border border-borda bg-superficie px-3 py-2 text-sm',
        'outline-none focus:border-marca-500 focus:ring-2 focus:ring-marca-100',
        className,
      )}
      {...props}
    />
  )
}
