import Link from 'next/link'
import type { CourseView } from '@/server/viewer'
import { RequestAccessForm } from './request-access-form'

export function LockedCourse({
  course,
  requestStatus,
}: {
  course: CourseView
  requestStatus: 'none' | 'pending'
}) {
  // Mesma cadeia de três degraus de area-card.tsx (item 3 da revisão de
  // branch) — aqui o buraco era pior que em course-card.tsx: o cartão que
  // envolve a capa usa bg-superficie, que no escuro é #221f20, o MESMO
  // valor de --color-capa-fundo. Sem o terceiro degrau, a área da capa
  // ficava 1,00:1 contra o próprio contêiner — literalmente a mesma cor,
  // distinguível só pela borda de 1px. from-azul/to-ciano quebra esse
  // empate porque nenhum dos dois é igual a bg-superficie em tema nenhum.
  const semReserva = !course.coverUrl && !course.areaColor

  return (
    <div className="mx-auto max-w-lg">
      {/* A saída importa MAIS aqui do que na tela normal: quem cai num curso
          bloqueado não tem nada para fazer nesta página além de pedir acesso,
          e sem o link ficava sem caminho de volta. */}
      <Link
        href={course.areaSlug ? `/area/${course.areaSlug}` : '/'}
        className="mb-2 inline-block text-xs text-texto-suave hover:underline"
      >
        ← {course.areaName ?? 'Início'}
      </Link>

      <div className="rounded-card border border-borda bg-superficie p-8 text-center">
        <div
          className={`aspect-video w-full overflow-hidden rounded-card border border-borda ${
            semReserva ? 'bg-gradient-to-b from-azul to-ciano' : 'bg-capa-fundo'
          }`}
          style={course.areaColor && !course.coverUrl ? { backgroundColor: course.areaColor } : undefined}
        >
          {course.coverUrl && (
            // Capa é URL externa informada pelo líder; next/image exigiria allowlist de domínio.
            // Mesmo mecanismo de course-card.tsx: a capa de um curso bloqueado já é
            // exibida na vitrine, então não é uma fronteira de confiança nova aqui.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={course.coverUrl} alt="" className="h-full w-full object-cover" />
          )}
      </div>

      <span aria-hidden className="mt-4 block text-3xl">
        🔒
      </span>
      <h1 className="mt-3 text-lg font-semibold">{course.title}</h1>
      <p className="mt-1 text-xs text-texto-suave">{course.areaName ?? 'Trilha inicial'}</p>
      {course.description && <p className="mt-4 text-sm text-texto-suave">{course.description}</p>}
      <p className="mt-6 text-sm text-texto-suave">Você ainda não tem acesso a este curso.</p>
      <RequestAccessForm courseSlug={course.slug} jaSolicitado={requestStatus === 'pending'} />
      </div>
    </div>
  )
}
