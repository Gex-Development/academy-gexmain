import type { ReactNode } from 'react'
import { GexLogo } from '@/components/layout/gex-logo'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* A §7.4 da spec pede a logo no lugar do texto "GEX Academy" — esta
            é a primeira tela que qualquer pessoa vê.

            Altura generosa de propósito: aqui a logo não é item de barra, é a
            marca principal da tela. A arte é 687x418 (~1,64:1), então h-28
            (112px) dá ~184px de largura — cerca de metade do cartão de login,
            que tem max-w-sm (384px). Se crescer muito além disso, a logo passa
            a competir com o formulário em vez de apresentá-lo. */}
        <div className="surge">
          <GexLogo className="flutua mx-auto mb-8 h-28 w-auto text-marca-600" />
        </div>
        {/* A moldura (globals.css) desenha a borda de 1,5px com o feixe girando;
            o raio de dentro desconta esse 1,5px para as curvas ficarem paralelas. */}
        <div className="surge moldura-luz rounded-card shadow-destaque [animation-delay:150ms]">
          <div className="rounded-[calc(var(--radius-card)-1.5px)] bg-superficie p-6">{children}</div>
        </div>
      </div>
    </div>
  )
}
