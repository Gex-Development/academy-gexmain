import Link from 'next/link'
import { notFound } from 'next/navigation'
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
      <Link href={`/gerenciar/cursos/${id}`} className="text-xs text-texto-suave hover:underline">
        ← Voltar ao curso
      </Link>
      <h1 className="mb-6 mt-2 text-xl font-semibold">{lesson.title}</h1>
      <LessonForm lesson={lesson} />
      <div className="mt-8 max-w-md">
        <AttachmentManager lessonId={lessonId} attachments={attachments} />
      </div>
    </div>
  )
}
