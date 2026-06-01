/**
 * @extends-from lib/teacher/use-chapter-classroom-status-polling.ts
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';

import {
  chapterStatusesNeedPolling,
  fetchChapterClassroomStatuses,
  isActiveChapterClassroomStatus,
  mergePolledChapterStatuses,
  shouldNotifyChapterNoLongerActive,
} from '@/lib/teacher/chapter-classroom-status-sync';
import type { ChapterClassroomUiState } from '@/lib/teacher/chapter-classroom-ui';

const DEFAULT_POLL_INTERVAL_MS = 3000;

export interface UseChapterClassroomStatusPollingOptions {
  readonly projectId: string | null;
  readonly chapterIds: readonly string[];
  readonly statuses: Readonly<Record<string, ChapterClassroomUiState>>;
  readonly setStatuses: React.Dispatch<
    React.SetStateAction<Record<string, ChapterClassroomUiState>>
  >;
  readonly pinnedGeneratingChapterId?: string | null;
  readonly onChapterNoLongerActive?: (chapterId: string) => void;
  readonly pollIntervalMs?: number;
}

export function useChapterClassroomStatusPolling({
  projectId,
  chapterIds,
  statuses,
  setStatuses,
  pinnedGeneratingChapterId = null,
  onChapterNoLongerActive,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}: UseChapterClassroomStatusPollingOptions): void {
  const statusesRef = useRef(statuses);
  const chapterIdsRef = useRef(chapterIds);
  const pinnedIdRef = useRef(pinnedGeneratingChapterId);
  const pollFailuresRef = useRef<Record<string, number>>({});

  useEffect(() => {
    statusesRef.current = statuses;
  }, [statuses]);

  useEffect(() => {
    chapterIdsRef.current = chapterIds;
  }, [chapterIds]);

  useEffect(() => {
    pinnedIdRef.current = pinnedGeneratingChapterId;
  }, [pinnedGeneratingChapterId]);

  const chapterIdsKey = useMemo(() => chapterIds.join('\u0000'), [chapterIds]);

  const syncFromServer = useCallback(async () => {
    const pid = projectId;
    const ids = chapterIdsRef.current;
    if (!pid || ids.length === 0) return;

    const fresh = await fetchChapterClassroomStatuses(pid, ids);
    const failures = pollFailuresRef.current;
    const pinnedId = pinnedIdRef.current;

    for (const id of ids) {
      if (fresh[id]) {
        delete failures[id];
        continue;
      }
      const prevUi = statusesRef.current[id];
      if (prevUi && isActiveChapterClassroomStatus(prevUi.status)) {
        failures[id] = (failures[id] ?? 0) + 1;
      }
    }

    setStatuses((prev) =>
      mergePolledChapterStatuses(prev, fresh, {
        pinnedGeneratingChapterId: pinnedId,
        pollFailures: failures,
      }),
    );

    if (onChapterNoLongerActive) {
      for (const [chapterId, ui] of Object.entries(fresh)) {
        if (
          shouldNotifyChapterNoLongerActive(
            chapterId,
            statusesRef.current[chapterId],
            ui,
            pinnedId,
          )
        ) {
          onChapterNoLongerActive(chapterId);
        }
      }
    }
  }, [projectId, setStatuses, onChapterNoLongerActive]);

  useEffect(() => {
    if (!projectId || chapterIds.length === 0) return;

    let cancelled = false;

    const run = async () => {
      if (cancelled) return;
      await syncFromServer();
    };

    void run();

    const interval = setInterval(() => {
      if (chapterStatusesNeedPolling(statusesRef.current)) {
        void run();
      }
    }, pollIntervalMs);

    const refresh = () => {
      if (document.visibilityState === 'visible') void run();
    };

    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void run();
    };
    window.addEventListener('pageshow', onPageShow);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [projectId, chapterIdsKey, chapterIds.length, syncFromServer, pollIntervalMs]);
}
