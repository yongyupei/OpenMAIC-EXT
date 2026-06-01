/**
 * @extends-from lib/course-editor/routes.ts
 * @fork-branch feat/html-slide-design-workbench
 */
export function buildCourseEditPath(classroomId: string): string {
  return `/classroom/${encodeURIComponent(classroomId)}/edit`;
}
