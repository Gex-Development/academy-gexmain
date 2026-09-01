import type { ReactNode } from 'react'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center text-xl font-semibold text-marca-600">GEX Academy</h1>
        <div className="rounded-card border border-borda bg-superficie p-6">{children}</div>
      </div>
    </div>
  )
}
