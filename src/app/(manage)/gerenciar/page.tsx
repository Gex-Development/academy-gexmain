import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth/session'
import { listAreas } from '@/server/areas'
import { listManagedCourses } from '@/server/courses'
import { CourseForm } from './course-form'

export const metadata = { title: 'Gerenciar — GEX Academy' }

export default async function GerenciarPage() {
  const [user, courses, areas] = await Promise.all([
    getCurrentUser(),
    listManagedCourses(),
    listAreas(),
  ])

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_340px]">
      <section>
        <h1 className="mb-4 text-xl font-semibold">Meus cursos</h1>
        {courses.length === 0 ? (
          <p className="text-sm text-texto-suave">
            Nenhum curso ainda. Crie o primeiro ao lado.
          </p>
        ) : (
          <ul className="divide-y divide-borda rounded-card border border-borda bg-superficie">
            {courses.map((course) => (
              <li key={course.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1">
                  <Link href={`/gerenciar/cursos/${course.id}`} className="text-sm font-medium hover:underline">
                    {course.title}
                  </Link>
                  <p className="text-xs text-texto-suave">
                    {course.isOnboarding ? 'Trilha inicial' : (course.areaName ?? 'Sem área')} ·{' '}
                    {course.publishedLessonCount} de {course.lessonCount} aulas publicadas
                  </p>
                </div>
                <span
                  className={
                    course.status === 'published'
                      ? 'rounded-full bg-sucesso/10 px-2 py-0.5 text-xs text-sucesso'
                      : 'rounded-full bg-aviso/10 px-2 py-0.5 text-xs text-aviso'
                  }
                >
                  {course.status === 'published' ? 'Publicado' : 'Rascunho'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-texto-suave">
          Novo curso
        </h2>
        {/*
          O id do curso que ainda vai ser criado nasce aqui, no servidor, e
          viaja como prop — mesmo desenho de /admin/areas. É ele que permite
          subir a capa antes de o curso existir (o arquivo mora em
          `curso/<id>/...`). No servidor porque servidor e cliente precisam
          renderizar o MESMO valor, e porque createCourse revalida esta rota:
          a cada curso criado, a página roda de novo e manda um id novo.
        */}
        <CourseForm areas={areas} isAdmin={user!.role === 'admin'} novoId={crypto.randomUUID()} />
      </aside>
    </div>
  )
}
