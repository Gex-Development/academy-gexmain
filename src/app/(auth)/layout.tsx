import type { ReactNode } from 'react'
import { GexLogo } from '@/components/layout/gex-logo'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* A §7.4 da spec pede a logo no lugar do texto "GEX Academy" — esta
            é a primeira tela que qualquer pessoa vê. */}
        <GexLogo className="mx-auto mb-6 h-10 w-auto text-marca-600" />
        <div className="rounded-card border border-borda bg-superficie p-6">{children}</div>
      </div>
    </div>
  )
}
