/**
 * @extends-from lib/teacher/chapter-reference-material.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { resolveChapterKnowledgeNodeIds } from '@/lib/teacher/chapter-knowledge-mount';
import type { CourseChapter, CourseProject } from '@/lib/teacher/course-types';

/** Whether the chapter has KB mounts and/or uploaded reference files (before text extraction). */
export function chapterHasAttachedReferenceSources(
  project: CourseProject,
  chapter: CourseChapter,
): boolean {
  const kbIds = resolveChapterKnowledgeNodeIds(project, chapter);
  const uploads = chapter.referenceFiles?.length ?? 0;
  return kbIds.length > 0 || uploads > 0;
}

/** Whether merged reference text is non-empty after KB + upload extraction. */
export function chapterHasReferenceText(referenceText: string | undefined): boolean {
  return Boolean(referenceText?.trim());
}

export function countChapterKnowledgeNodeIds(project: CourseProject, chapter: CourseChapter): number {
  return resolveChapterKnowledgeNodeIds(project, chapter).length;
}

/** Count merged KB nodes for UI hints without a full project load. */
export function countEffectiveChapterKnowledgeMount(
  projectKnowledge: CourseProject['knowledge'],
  chapter: Pick<CourseChapter, 'id' | 'knowledgeNodeIds'>,
): number {
  return resolveChapterKnowledgeNodeIds(
    {
      id: '',
      title: '',
      requirements: { requirement: '' },
      chapterCount: 0,
      workflowTemplateId: 'standard-course',
      status: 'draft',
      createdAt: '',
      updatedAt: '',
      artifacts: [],
      knowledge: projectKnowledge,
    },
    {
      id: chapter.id,
      title: '',
      learningObjectives: [],
      sceneOutlines: [],
      status: 'draft',
      dirty: false,
      locked: false,
      order: 0,
      knowledgeNodeIds: chapter.knowledgeNodeIds,
    },
  ).length;
}
