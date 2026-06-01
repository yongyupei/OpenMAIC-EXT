/**
 * @extends-from lib/teacher/resolve-resume-path.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import type { CourseProject, CourseProjectStatus } from '@/lib/teacher/course-types';
import {
  buildTeacherDesignPath,
  buildTeacherGeneratePath,
  buildTeacherStudioPath,
} from '@/lib/teacher/routes';

export function resolveTeacherProjectResumePath(
  project: Pick<CourseProject, 'id' | 'status'>,
): string {
  return resolveTeacherProjectResumePathForStatus(project.id, project.status);
}

export function resolveTeacherProjectResumePathForStatus(
  projectId: string,
  status: CourseProjectStatus,
): string {
  switch (status) {
    case 'generating':
      return buildTeacherGeneratePath(projectId);
    case 'editing':
    case 'published':
      return buildTeacherStudioPath(projectId);
    case 'draft':
    case 'outlining':
    case 'outline-ready':
    default:
      return buildTeacherDesignPath(projectId);
  }
}
