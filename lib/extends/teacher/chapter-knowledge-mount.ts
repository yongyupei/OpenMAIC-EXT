/**
 * @extends-from lib/teacher/chapter-knowledge-mount.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import type { CourseChapter, CourseProject } from '@/lib/teacher/course-types';

/** Course mount (minus exclusions) merged with chapter-specific knowledge-base node IDs. */
export function resolveChapterKnowledgeNodeIds(
  project: CourseProject,
  chapter: CourseChapter,
): string[] {
  const projectMountIds = project.knowledge?.mount.nodeIds ?? [];
  const excluded = new Set(project.knowledge?.chapterExclusions?.[chapter.id] ?? []);
  const fromCourse = projectMountIds.filter((id) => !excluded.has(id));
  const fromChapter = chapter.knowledgeNodeIds ?? [];
  return [...new Set([...fromCourse, ...fromChapter])];
}
