/**
 * @extends-from lib/teacher/chapter-classroom-status-sync.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { parseChapterClassroomPayload } from '@/lib/teacher/chapter-classroom-api';
import {
  chapterClassroomToUiState,
  type ChapterClassroomUiState,
} from '@/lib/teacher/chapter-classroom-ui';
import type { CourseChapterClassroom, CourseChapterClassroomStatus } from '@/lib/teacher/course-types';

/** Background jobs may run longer than a single scene; stale guard for client polling. */
export const CHAPTER_GENERATION_STALE_MS = 10 * 60 * 1000;

export const CHAPTER_GENERATION_STALE_REASON =
  'Generation timed out or the server stopped responding. Retry or regenerate this chapter.';

const ACTIVE_POLL_STATUSES = new Set<CourseChapterClassroomStatus>([
  'generating',
  'awaiting-outline-approval',
]);

export function isActiveChapterClassroomStatus(
  status: CourseChapterClassroomStatus | undefined,
): boolean {
  return status !== undefined && ACTIVE_POLL_STATUSES.has(status);
}

export function chapterStatusesNeedPolling(
  statuses: Readonly<Record<string, ChapterClassroomUiState>>,
): boolean {
  return Object.values(statuses).some((ui) => isActiveChapterClassroomStatus(ui.status));
}

export function isStaleGeneratingClassroom(
  classroom: CourseChapterClassroom,
  staleAfterMs = CHAPTER_GENERATION_STALE_MS,
  nowMs = Date.now(),
): boolean {
  if (!isActiveChapterClassroomStatus(classroom.status)) {
    return false;
  }
  const updatedAt = Date.parse(classroom.updatedAt);
  if (!Number.isFinite(updatedAt)) {
    return false;
  }
  return nowMs - updatedAt > staleAfterMs;
}

export function chapterClassroomToUiStateWithStaleGuard(
  classroom: CourseChapterClassroom | null | undefined,
  options?: { staleAfterMs?: number; nowMs?: number },
): ChapterClassroomUiState | undefined {
  if (!classroom) return undefined;

  if (isStaleGeneratingClassroom(classroom, options?.staleAfterMs, options?.nowMs)) {
    return {
      status: 'failed',
      failedReason: CHAPTER_GENERATION_STALE_REASON,
      failedStep: classroom.sceneCount && classroom.sceneCount > 0 ? 'scenes' : 'outline',
      sceneCount: classroom.sceneCount,
      lastTraceId: classroom.lastTraceId,
    };
  }

  return chapterClassroomToUiState(classroom);
}

/** Fetches latest chapter classroom rows from the teacher chapter API. */
export async function fetchChapterClassroomStatuses(
  projectId: string,
  chapterIds: readonly string[],
): Promise<Record<string, ChapterClassroomUiState>> {
  const entries = await Promise.all(
    chapterIds.map(async (chapterId) => {
      try {
        const res = await fetch(
          `/api/extends/teacher/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}`,
        );
        if (!res.ok) {
          return [chapterId, null] as const;
        }
        const json: unknown = await res.json();
        const classroom = parseChapterClassroomPayload(json);
        const ui = chapterClassroomToUiStateWithStaleGuard(classroom ?? null);
        return [chapterId, ui] as const;
      } catch {
        return [chapterId, null] as const;
      }
    }),
  );

  const map: Record<string, ChapterClassroomUiState> = {};
  for (const [chapterId, ui] of entries) {
    if (ui) map[chapterId] = ui;
  }
  return map;
}

/**
 * Merges polled statuses into local state. While the user is starting generation,
 * do not let a stale server `failed` overwrite optimistic `generating`.
 */
export function mergePolledChapterStatuses(
  prev: Readonly<Record<string, ChapterClassroomUiState>>,
  fresh: Readonly<Record<string, ChapterClassroomUiState>>,
  options?: {
    readonly pinnedGeneratingChapterId?: string | null;
    readonly pollFailures?: Readonly<Record<string, number>>;
    readonly maxPollFailures?: number;
  },
): Record<string, ChapterClassroomUiState> {
  const maxFailures = options?.maxPollFailures ?? 3;
  const failures = options?.pollFailures ?? {};
  const pinnedId = options?.pinnedGeneratingChapterId ?? null;
  const next: Record<string, ChapterClassroomUiState> = { ...prev };

  for (const [chapterId, ui] of Object.entries(fresh)) {
    const previous = prev[chapterId];
    if (
      pinnedId === chapterId &&
      previous?.status === 'generating' &&
      ui.status === 'failed'
    ) {
      continue;
    }
    next[chapterId] = ui;
  }

  for (const [chapterId, ui] of Object.entries(prev)) {
    if (fresh[chapterId] !== undefined) continue;
    if (!isActiveChapterClassroomStatus(ui.status)) continue;
    if ((failures[chapterId] ?? 0) < maxFailures) continue;

    const failedStep =
      ui.sceneCount && ui.sceneCount > 0 ? ('scenes' as const) : ('outline' as const);
    next[chapterId] = {
      status: 'failed',
      failedReason: CHAPTER_GENERATION_STALE_REASON,
      failedStep,
      sceneCount: ui.sceneCount,
    };
  }

  return next;
}

export function shouldNotifyChapterNoLongerActive(
  chapterId: string,
  prev: ChapterClassroomUiState | undefined,
  fresh: ChapterClassroomUiState,
  pinnedGeneratingChapterId?: string | null,
): boolean {
  if (!prev || !isActiveChapterClassroomStatus(prev.status)) return false;
  if (isActiveChapterClassroomStatus(fresh.status)) return false;
  if (
    pinnedGeneratingChapterId === chapterId &&
    prev.status === 'generating' &&
    fresh.status === 'failed'
  ) {
    return false;
  }
  return true;
}

export function chapterClassroomsToUiMapWithStaleGuard(
  chapterClassrooms: Record<string, CourseChapterClassroom> | undefined,
): Record<string, ChapterClassroomUiState> {
  const map: Record<string, ChapterClassroomUiState> = {};
  if (!chapterClassrooms) return map;
  for (const [chapterId, classroom] of Object.entries(chapterClassrooms)) {
    const ui = chapterClassroomToUiStateWithStaleGuard(classroom);
    if (ui) map[chapterId] = ui;
  }
  return map;
}
