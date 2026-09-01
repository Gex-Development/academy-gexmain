import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { ehRotaPublica } from '@/lib/auth/public-routes'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value),
          )
        },
      },
    },
  )

  // Não coloque código entre createServerClient e getUser: um erro aqui causa
  // logout aleatório e é muito difícil de depurar.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const ehPublica = ehRotaPublica(request.nextUrl.pathname)

  if (!user && !ehPublica) {
    const destino = `${request.nextUrl.pathname}${request.nextUrl.search}`
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    // Inclui a query string do destino original (não só o pathname): sem
    // isso, uma pessoa barrada numa rota com estado na URL (filtro, página)
    // perderia esse estado ao ser mandada para o login e de volta.
    url.searchParams.set('redirect', destino)
    return NextResponse.redirect(url)
  }

  // Devolva supabaseResponse como está: recriá-lo dessincroniza os cookies e
  // encerra a sessão do usuário antes da hora.
  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
