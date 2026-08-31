import { describe, expect, it } from 'vitest'
import { adminClient } from './client'

const db = adminClient()

describe('tabela areas', () => {
  it('impede duas áreas com o mesmo slug', async () => {
    const slug = `design-${Date.now()}`
    const primeira = await db.from('areas').insert({ name: 'Design', slug })
    expect(primeira.error).toBeNull()

    const { error } = await db.from('areas').insert({ name: 'Design', slug })
    expect(error?.code).toBe('23505')
  })

  it('bloqueia leitura sem sessão porque o RLS está ligado', async () => {
    const { createClient } = await import('@supabase/supabase-js')
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false } },
    )
    const { data } = await anon.from('areas').select('id')
    expect(data).toEqual([])
  })
})
