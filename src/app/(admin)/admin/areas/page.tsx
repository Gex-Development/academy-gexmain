import { listAreas } from '@/server/areas'
import { AreaForm } from './area-form'
import { AreaRow } from './area-row'

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
              <AreaRow key={area.id} area={area} />
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
