/**
 * @extends-from lib/teacher/course-run-status.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import type { CourseProject, TeacherRunStatus } from '@/lib/teacher/course-types';

export function withRunStatus(
  project: CourseProject,
  run: TeacherRunStatus,
  now = new Date().toISOString(),
): CourseProject {
  return {
    ...project,
    updatedAt: now,
    run,
  };
}
