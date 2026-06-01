/**
 * @extends-from app/teacher/projects/[projectId]/generate/page.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
import { notFound, redirect } from 'next/navigation';

import { TeacherProjectGenerateShell } from '@/components/teacher/teacher-project-generate-shell';
import { readTeacherProject } from '@/lib/teacher/course-project-storage';
import { getEditableClassroomId } from '@/lib/teacher/get-editable-classroom-id';
import { buildTeacherStudioPath } from '@/lib/teacher/routes';

export default async function TeacherGeneratePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ chapterId?: string }>;
}) {
  const { projectId } = await params;
  const { chapterId } = await searchParams;
  const focusChapterId =
    typeof chapterId === 'string' && chapterId.trim() ? chapterId.trim() : null;

  const project = await readTeacherProject(projectId);
  if (!project) notFound();

  const classroomId = getEditableClassroomId(project, projectId);
  if (classroomId && !focusChapterId) {
    redirect(buildTeacherStudioPath(projectId));
  }

  return <TeacherProjectGenerateShell initialProject={project} focusChapterId={focusChapterId} />;
}
