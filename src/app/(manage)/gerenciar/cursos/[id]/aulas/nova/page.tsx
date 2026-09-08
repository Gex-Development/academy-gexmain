import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getManagedCourse } from '@/server/courses'
import { NewLessonForm } from './new-lesson-form'

/*
 * Página de aula nova.
 *
 * O segmento 'nova' é estático e mora ao lado de [lessonId], que é dinâmico.
 * O Next resolve o estático primeiro, então esta rota ganha — e não há
 * ambiguidade real: id de aula é UUID, nunca a palavra "nova".
 *
 * A permissão é checada AQUI, não só no createLesson: sem isto, quem não
 * gerencia o curso veria o formulário inteiro e só descobriria que não podia
 * ao tentar salvar. getManagedCourse é a mesma função que a action usa.
 */
export default async function NovaAulaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const curso = await getManagedCourse(id)
  if (!curso) notFound()

  return (
    <div>
      <Link href={`/gerenciar/cursos/${id}`} className="text-xs text-texto-suave hover:underline">
        ← Voltar ao curso
      </Link>
      <h1 className="mb-1 mt-2 text-xl font-semibold">Nova aula</h1>
      <p className="mb-6 text-sm text-texto-suave">{curso.title}</p>
      <NewLessonForm courseId={id} />
    </div>
  )
}
