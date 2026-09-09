import { notFound } from 'next/navigation'
import { Voltar } from '@/components/layout/voltar'
import { listAttachments } from '@/server/attachments'
import { getLessonForEdit } from '@/server/lessons'
import { AttachmentManager } from './attachment-manager'
import { LessonForm } from './lesson-form'

export default async function EditarAulaPage({
  params,
}: {
  params: Promise<{ id: string; lessonId: string }>
}) {
  const { id, lessonId } = await params
  const lesson = await getLessonForEdit(lessonId)
  if (!lesson || lesson.courseId !== id) notFound()

  const attachments = await listAttachments(lessonId)

  return (
    <div>
      <Voltar href={`/gerenciar/cursos/${id}`}>Voltar ao curso</Voltar>
      <h1 className="mb-6 mt-2 text-xl font-semibold">{lesson.title}</h1>
      <LessonForm lesson={lesson} />
      <div className="mt-8 max-w-md">
        <AttachmentManager lessonId={lessonId} attachments={attachments} />
      </div>
    </div>
  )
}
