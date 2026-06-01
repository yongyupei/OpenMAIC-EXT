/**
 * @extends-from tests/teacher/chapter-classroom-status-sync.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, it } from 'vitest';

import {
  CHAPTER_GENERATION_STALE_MS,
  chapterClassroomToUiStateWithStaleGuard,
  isStaleGeneratingClassroom,
  mergePolledChapterStatuses,
  shouldNotifyChapterNoLongerActive,
} from '@/lib/teacher/chapter-classroom-status-sync';
import type { ChapterClassroomUiState } from '@/lib/teacher/chapter-classroom-ui';
import type { CourseChapterClassroom } from '@/lib/teacher/course-types';

function classroom(
  overrides: Partial<CourseChapterClassroom> & Pick<CourseChapterClassroom, 'status'>,
): CourseChapterClassroom {
  return {
    chapterId: 'ch-1',
    classroomId: 'cls-1',
    sceneCount: 0,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('chapter-classroom-status-sync', () => {
  it('marks long-running generating as failed in UI', () => {
    const now = Date.parse('2026-05-20T12:00:00.000Z');
    const updatedAt = new Date(now - CHAPTER_GENERATION_STALE_MS - 1000).toISOString();
    const row = classroom({ status: 'generating', updatedAt });

    expect(isStaleGeneratingClassroom(row, CHAPTER_GENERATION_STALE_MS, now)).toBe(true);

    const ui = chapterClassroomToUiStateWithStaleGuard(row, {
      staleAfterMs: CHAPTER_GENERATION_STALE_MS,
      nowMs: now,
    });
    expect(ui?.status).toBe('failed');
    expect(ui?.failedReason).toBeTruthy();
  });

  it('keeps recent generating status unchanged', () => {
    const now = Date.parse('2026-05-20T12:00:00.000Z');
    const updatedAt = new Date(now - 60_000).toISOString();
    const row = classroom({ status: 'generating', updatedAt });

    expect(isStaleGeneratingClassroom(row, CHAPTER_GENERATION_STALE_MS, now)).toBe(false);

    const ui = chapterClassroomToUiStateWithStaleGuard(row, {
      staleAfterMs: CHAPTER_GENERATION_STALE_MS,
      nowMs: now,
    });
    expect(ui?.status).toBe('generating');
  });

  it('does not stale-guard ready chapters', () => {
    const row = classroom({ status: 'ready' });
    const ui = chapterClassroomToUiStateWithStaleGuard(row);
    expect(ui?.status).toBe('ready');
  });

  it('does not overwrite pinned optimistic generating with polled failed', () => {
    const prev: Record<string, ChapterClassroomUiState> = {
      'ch-1': { status: 'generating', sceneCount: 4 },
    };
    const fresh: Record<string, ChapterClassroomUiState> = {
      'ch-1': {
        status: 'failed',
        failedReason: 'old error',
        sceneCount: 4,
      },
    };
    const merged = mergePolledChapterStatuses(prev, fresh, {
      pinnedGeneratingChapterId: 'ch-1',
    });
    expect(merged['ch-1']?.status).toBe('generating');
  });

  it('does not notify inactive when pinned generating is overwritten by failed', () => {
    const prev: ChapterClassroomUiState = { status: 'generating', sceneCount: 4 };
    const fresh: ChapterClassroomUiState = {
      status: 'failed',
      failedReason: 'old error',
      sceneCount: 4,
    };
    expect(shouldNotifyChapterNoLongerActive('ch-1', prev, fresh, 'ch-1')).toBe(false);
  });

  it('notifies when server generating transitions to ready', () => {
    const prev: ChapterClassroomUiState = { status: 'generating' };
    const fresh: ChapterClassroomUiState = { status: 'ready', sceneCount: 3 };
    expect(shouldNotifyChapterNoLongerActive('ch-1', prev, fresh, null)).toBe(true);
  });
});
