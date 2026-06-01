/**
 * @extends-from app/teacher/projects/[projectId]/design/page.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
import { notFound } from 'next/navigation';

import { CourseProjectDesignShell } from '@/components/teacher/course-project-design-shell';
import { readTeacherProject } from '@/lib/teacher/course-project-storage';

export default async function TeacherProjectDesignPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await readTeacherProject(projectId);
  if (!project) notFound();

  return <CourseProjectDesignShell initialProject={project} />;
}
