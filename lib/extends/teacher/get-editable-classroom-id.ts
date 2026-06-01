/**
 * @extends-from lib/teacher/get-editable-classroom-id.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import type { CourseProject } from '@/lib/teacher/course-types';
import { hasPreviewableGeneratedContent } from '@/lib/teacher/course-publish';

/** Returns the persisted classroom id when the teacher project is published and editable in studio. */
export function getEditableClassroomId(
  project: CourseProject,
  routeProjectId: string = project.id,
): string | null {
  if (project.id !== routeProjectId) return null;
  if (!project.publishedClassroomId) return null;
  if (project.status !== 'published') return null;

  return project.publishedClassroomId;
}

/** Classroom id for opening studio when partial content exists (after incremental publish). */
export function getTeacherStudioClassroomId(
  project: CourseProject,
  routeProjectId: string = project.id,
): string | null {
  return getEditableClassroomId(project, routeProjectId);
}

/** Whether the generate workbench can show slide/quiz previews from the project store. */
export function canPreviewGeneratedContentOnGeneratePage(project: CourseProject): boolean {
  return hasPreviewableGeneratedContent(project);
}
