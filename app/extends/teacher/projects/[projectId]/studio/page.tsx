/**
 * @extends-from app/teacher/projects/[projectId]/studio/page.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
import { notFound } from 'next/navigation';

import {
  CourseStudioShell,
  CourseStudioUnavailable,
} from '@/components/teacher/course-studio-shell';
import { readTeacherProject } from '@/lib/teacher/course-project-storage';
import { getEditableClassroomId } from '@/lib/teacher/get-editable-classroom-id';

export default async function TeacherStudioPage({
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
  if (!classroomId) {
    return <CourseStudioUnavailable projectId={project.id} />;
  }

  return (
    <CourseStudioShell
      project={project}
      classroomId={classroomId}
      initialChapterId={focusChapterId}
    />
  );
}
