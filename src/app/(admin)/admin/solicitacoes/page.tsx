import { listAccessRequests } from '@/server/access-requests'
import { RequestRow } from './request-row'

export const metadata = { title: 'Solicitações — GEX Academy' }

export default async function SolicitacoesPage() {
  const requests = await listAccessRequests()

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-semibold">Solicitações de acesso</h1>
      <p className="mb-6 mt-1 text-sm text-texto-suave">
        {requests.length === 0
          ? 'Nenhuma solicitação pendente.'
          : `${requests.length} ${requests.length === 1 ? 'pedido aguardando' : 'pedidos aguardando'} sua decisão.`}
      </p>

      <ul className="flex flex-col gap-3">
        {requests.map((request) => (
          <RequestRow key={request.id} request={request} />
        ))}
      </ul>
    </div>
  )
}
