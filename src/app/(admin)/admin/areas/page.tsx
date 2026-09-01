import { listAreas } from '@/server/areas'
import { AreaForm } from './area-form'

export const metadata = { title: 'Áreas — GEX Academy' }

export default async function AreasPage() {
  const areas = await listAreas()

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_320px]">
      <section>
        <h1 className="mb-4 text-xl font-semibold">Áreas</h1>
        {areas.length === 0 ? (
          <p className="text-sm text-texto-suave">
            Nenhuma área cadastrada. Crie a primeira ao lado.
          </p>
        ) : (
          <ul className="divide-y divide-borda rounded-card border border-borda bg-superficie">
            {areas.map((area) => (
              <li key={area.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  aria-hidden
                  className="size-3 rounded-full border border-borda"
                  style={{ backgroundColor: area.color ?? 'transparent' }}
                />
                <div className="flex-1">
                  <p className="text-sm font-medium">{area.name}</p>
                  <p className="text-xs text-texto-suave">/{area.slug}</p>
                </div>
                <span className="text-xs text-texto-suave">posição {area.position}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-texto-suave">
          Nova área
        </h2>
        <AreaForm />
      </aside>
    </div>
  )
}
