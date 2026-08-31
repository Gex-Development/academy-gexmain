import { listAreas } from '@/server/areas'
import { listPeople } from '@/server/people'
import { InviteForm } from './invite-form'
import { PersonRowItem } from './person-row'

export const metadata = { title: 'Pessoas — GEX Academy' }

const ROTULO_STATUS = {
  invited: 'Convite pendente',
  active: 'Ativo',
  inactive: 'Desativado',
} as const

export default async function PessoasPage() {
  const [people, areas] = await Promise.all([listPeople(), listAreas()])

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_340px]">
      <section>
        <h1 className="mb-4 text-xl font-semibold">Pessoas</h1>
        <ul className="divide-y divide-borda rounded-card border border-borda bg-superficie">
          {people.map((person) => (
            <PersonRowItem
              key={person.id}
              person={person}
              areas={areas}
              statusLabel={ROTULO_STATUS[person.status]}
            />
          ))}
        </ul>
      </section>

      <aside>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-texto-suave">
          Convidar pessoa
        </h2>
        <InviteForm areas={areas} />
      </aside>
    </div>
  )
}
