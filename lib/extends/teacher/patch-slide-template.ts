/**
 * @extends-from lib/teacher/patch-slide-template.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import type { GenerationMode } from '@/lib/slide-templates/types';
import type { CourseProject } from '@/lib/teacher/course-types';
import { chaptersToPatch, patchTeacherProject } from '@/lib/teacher/teacher-projects-client';

function outlineChaptersToSnapshots(project: CourseProject) {
  return [...(project.outline?.chapters ?? [])]
    .sort((left, right) => left.order - right.order)
    .map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      learningObjectives: chapter.learningObjectives,
      summary: chapter.summary ?? '',
      deepSearchEnabled: chapter.deepSearchEnabled,
      knowledgeNodeIds: chapter.knowledgeNodeIds,
      slideTemplateId: chapter.slideTemplateId,
      generationMode: chapter.generationMode as GenerationMode | undefined,
    }));
}

/** Persists slide template selection at project or chapter scope. */
export async function patchProjectSlideTemplate(
  project: CourseProject,
  templateId: string,
  chapterId?: string,
): Promise<CourseProject> {
  if (chapterId) {
    const snapshots = outlineChaptersToSnapshots(project).map((chapter) =>
      chapter.id === chapterId ? { ...chapter, slideTemplateId: templateId } : chapter,
    );
    const { project: updated } = await patchTeacherProject(project.id, {
      chapters: chaptersToPatch(snapshots),
    });
    return updated;
  }

  const { project: updated } = await patchTeacherProject(project.id, {
    slideTemplateId: templateId,
  });
  return updated;
}
