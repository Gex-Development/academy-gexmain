import Link from 'next/link'

/**
 * O link de voltar das telas internas.
 *
 * Existe como componente para as seis telas que o usam ficarem idênticas —
 * antes cada uma escrevia o seu, com classes ligeiramente diferentes.
 *
 * O destino é FIXO (a tela de cima na hierarquia), não o histórico do
 * navegador. Voltar pelo histórico devolveria "a tela anterior", que parece
 * mais esperto, mas quebra em dois casos comuns: quem abre um link direto,
 * de um convite ou de uma mensagem, não tem histórico nenhum; e quem chegou
 * por vários caminhos vê o botão levar a lugares diferentes a cada vez. Um
 * destino fixo sempre funciona e sempre diz para onde vai — o próprio rótulo
 * é o nome de onde ele leva.
 *
 * Não entra nas telas que já estão no menu do topo (Início, Perfil, Áreas,
 * Pessoas, Solicitações, Gerenciar, Dúvidas, Progresso): ali o voltar
 * apontaria para algo que já está a um clique de distância.
 */
export function Voltar({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-xs text-texto-suave transition-colors hover:text-texto"
    >
      <span aria-hidden="true">←</span>
      {children}
    </Link>
  )
}
