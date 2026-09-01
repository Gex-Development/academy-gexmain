'use client'

import { useState } from 'react'
import { Field } from './field'
import { Input } from './input'

/**
 * Campo de URL de capa com um retângulo na proporção real.
 *
 * O retângulo existe por um pedido concreto do dono do produto: quem vai
 * fazer a arte precisa saber a medida ANTES de fazer, senão sobe uma imagem
 * de proporção errada e ela aparece esticada ou cortada. Vazio, o retângulo
 * declara a medida; preenchido, mostra a prévia com o MESMO corte da tela
 * real, para o problema aparecer aqui e não depois.
 */
export function CoverField({
  name,
  largura,
  altura,
  defaultValue,
  label = 'URL da capa',
}: {
  name: string
  largura: number
  altura: number
  defaultValue?: string
  label?: string
}) {
  const [url, setUrl] = useState(defaultValue ?? '')

  return (
    <Field
      label={label}
      htmlFor={name}
      hint={`${largura} × ${altura} px. Deixe o essencial no centro: em telas largas a imagem é cortada em faixa.`}
    >
      <div className="flex flex-col gap-2">
        <Input
          id={name}
          name={name}
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
        />
        <div
          className="flex items-center justify-center overflow-hidden rounded-card border border-dashed border-borda bg-fundo"
          style={{ aspectRatio: `${largura} / ${altura}` }}
        >
          {url ? (
            // Capa é URL externa informada por quem administra; next/image
            // exigiria allowlist de domínio. Mesmo mecanismo de course-card.tsx.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-xs text-texto-suave">
              {largura} × {altura} px
            </span>
          )}
        </div>
      </div>
    </Field>
  )
}
