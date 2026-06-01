/**
 * @extends-from app/teacher/projects/[projectId]/preview/page.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
import { notFound } from 'next/navigation';

import { TeacherPreviewShell } from '@/components/teacher/teacher-preview-shell';
import { readTeacherProject } from '@/lib/teacher/course-project-storage';

type PageProps = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ chapterId?: string }>;
};

export default async function TeacherPreviewPage({ params, searchParams }: PageProps) {
  const { projectId } = await params;
  const { chapterId } = await searchParams;

  const project = await readTeacherProject(projectId);
  if (!project) notFound();

  if (!project.outline || project.outline.chapters.length === 0) {
    notFound();
  }

  return <TeacherPreviewShell project={project} chapterId={chapterId} />;
}
