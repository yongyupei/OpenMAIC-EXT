/**
 * @extends-from lib/teacher/chapter-generation-resume.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import type { CourseChapter, CourseChapterClassroom } from '@/lib/teacher/course-types';
import type { Scene } from '@/lib/types/stage';

export type ChapterGenerationFailedStep = 'outline' | 'scenes';

export interface ChapterGenerateRequestOptions {
  readonly resume?: boolean;
  readonly regenerate?: boolean;
  /** Continue scene generation after outline was approved (outline-approval workflow). */
  readonly approveOutline?: boolean;
}

/** Whether POST should continue from partial chapter classroom data. */
export function shouldResumeChapterGeneration(
  previous: CourseChapterClassroom | undefined,
  options: ChapterGenerateRequestOptions,
): boolean {
  if (options.regenerate) return false;
  if (options.approveOutline) return true;
  if (options.resume) return true;
  return previous?.status === 'failed';
}

/** Index in sceneOutlines to start generating (0 = from beginning). */
export function getSceneGenerationStartIndex(
  existingScenes: readonly Scene[],
  regenerate: boolean,
): number {
  if (regenerate) return 0;
  return existingScenes.length;
}

/** Full regenerate clears stored outlines so Step 1 replans from requirements. */
export function chapterForFullRegenerate(
  chapter: CourseChapter,
  regenerate: boolean,
): CourseChapter {
  if (!regenerate) return chapter;
  return { ...chapter, sceneOutlines: [] };
}
