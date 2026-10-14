'use client'

import { useState, type InputHTMLAttributes } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/cn'

/**
 * Campo de senha com botão de olho para mostrar/ocultar o que foi digitado.
 * O botão fica dentro do campo, à direita; o `pr-10` reserva o espaço dele
 * para o texto não passar por baixo.
 */
export function InputSenha({ className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [visivel, setVisivel] = useState(false)
  const rotulo = visivel ? 'Ocultar senha' : 'Mostrar senha'

  return (
    <div className="relative">
      <Input {...props} type={visivel ? 'text' : 'password'} className={cn('pr-10', className)} />
      <button
        type="button"
        aria-label={rotulo}
        title={rotulo}
        aria-pressed={visivel}
        aria-controls={props.id}
        onClick={() => setVisivel((v) => !v)}
        className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-lg text-texto-suave transition-colors hover:text-texto focus:outline-none focus-visible:ring-2 focus-visible:ring-acao"
      >
        {visivel ? <OlhoRiscado /> : <Olho />}
      </button>
    </div>
  )
}

function Olho() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function OlhoRiscado() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.6 3.6" />
      <path d="M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7c1.9 0 3.6-.6 5-1.5" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m3 3 18 18" />
    </svg>
  )
}
