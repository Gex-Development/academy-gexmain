import type { ReactNode } from 'react'

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string
  htmlFor: string
  hint?: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-texto">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-texto-suave">{hint}</p>}
      {error && (
        <p role="alert" className="text-xs text-perigo">
          {error}
        </p>
      )}
    </div>
  )
}
