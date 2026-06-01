/**
 * @extends-from lib/teacher/chapter-generate-precheck.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import type {
  CourseChapterClassroom,
  CourseChapterClassroomStatus,
} from '@/lib/teacher/course-types';

export type ChapterGenerateStartAction =
  | 'post'
  | 'poll'
  | 'redirect-studio'
  | 'awaiting-outline-approval';

/** Whether the chapter studio route may render (including partial generation). */
export function canAccessChapterStudio(
  classroom: CourseChapterClassroom | null | undefined,
): boolean {
  if (!classroom) return false;
  if (classroom.status === 'ready' || classroom.status === 'published') return true;
  const hasPartialScenes = (classroom.sceneCount ?? 0) >= 1;
  return (
    hasPartialScenes &&
    (classroom.status === 'generating' || classroom.status === 'failed')
  );
}

/** Server generate page: skip redirect to studio when user requested full regenerate. */
export function shouldRedirectGeneratePageToStudio(
  serverStatus: CourseChapterClassroomStatus | undefined,
  options: { readonly regenerate?: boolean },
): boolean {
  if (options.regenerate) return false;
  return serverStatus === 'ready' || serverStatus === 'published';
}

/**
 * True when status is `generating` but no workflow step is set — typically the
 * design workbench PATCH (`start-generation`) before the generate POST runs.
 */
export function isPremarkedChapterGeneration(
  classroom: Pick<CourseChapterClassroom, 'status' | 'generationStep'> | null | undefined,
): boolean {
  return classroom?.status === 'generating' && !classroom.generationStep;
}

/**
 * Decide whether the chapter generate page should POST, poll, or redirect
 * before starting generation. Full regenerate must always POST so outline +
 * scenes run again.
 */
export function resolveChapterGenerateStartAction(
  serverStatus: CourseChapterClassroomStatus | undefined,
  options: { readonly resume?: boolean; readonly regenerate?: boolean },
  classroom?: Pick<CourseChapterClassroom, 'generationStep'> | null,
): ChapterGenerateStartAction {
  if (serverStatus === 'awaiting-outline-approval') {
    return 'awaiting-outline-approval';
  }

  if (serverStatus === 'generating') {
    // Design workbench marks generating before navigation; POST has not started yet.
    if (isPremarkedChapterGeneration({ status: serverStatus, generationStep: classroom?.generationStep })) {
      return 'post';
    }
    // Active workflow (generationStep set by POST /generate) — poll to avoid HMR duplicate POSTs.
    return 'poll';
  }

  if (options.regenerate) {
    return 'post';
  }

  if (serverStatus === 'ready' || serverStatus === 'published') {
    return 'redirect-studio';
  }

  return 'post';
}
