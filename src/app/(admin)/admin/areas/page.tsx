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
        {/*
          O id da área que ainda vai ser criada nasce AQUI, no servidor.
          Ele viaja como prop para o formulário, que o manda junto na
          gravação — e, antes disso, o usa como pasta do upload da capa
          (`area/<id>/...`), que é o que permite subir a imagem antes de a
          área existir.

          No servidor, e não no navegador, por dois motivos: servidor e
          cliente renderizam o MESMO valor (gerar no cliente divergiria e o
          React acusaria erro de hidratação), e createArea chama
          revalidatePath('/admin/areas') — então, a cada área criada, esta
          página roda de novo e manda um id novo, sem efeito nem estado no
          formulário.
        */}
        <AreaForm novoId={crypto.randomUUID()} />
      </aside>
    </div>
  )
}
