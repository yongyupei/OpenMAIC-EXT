'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  parseChapterClassroomFailedReason,
  parseChapterClassroomGenerationStep,
  parseChapterClassroomPayload,
  parseChapterClassroomStatus,
} from '@/lib/teacher/chapter-classroom-api';
import type { CourseChapterClassroom } from '@/lib/teacher/course-types';
import type { SceneOutline } from '@/lib/types/generation';
import { syncChapterStudioFromServer } from '@/lib/extends/teacher/sync-chapter-studio-generation';
import { useStageStore } from '@/lib/store/stage';

const POLL_INTERVAL_MS = 3000;

export interface ChapterStudioGenerationPollState {
  readonly loading: boolean;
  readonly loadFailed: boolean;
  readonly classroomStatus: CourseChapterClassroom['status'] | undefined;
  readonly generationStep: CourseChapterClassroom['generationStep'];
  readonly sceneCount: number;
  readonly totalScenes: number;
  readonly isGenerating: boolean;
  readonly generationFailed: boolean;
  readonly failedReason: string | null;
  readonly reload: () => Promise<void>;
}

export function useChapterStudioGenerationPoll({
  projectId,
  chapterId,
  classroomId,
  sceneOutlines,
  initialClassroom,
}: {
  readonly projectId: string;
  readonly chapterId: string;
  readonly classroomId: string;
  readonly sceneOutlines: readonly SceneOutline[];
  readonly initialClassroom?: CourseChapterClassroom;
}): ChapterStudioGenerationPollState {
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [classroomStatus, setClassroomStatus] = useState<
    CourseChapterClassroom['status'] | undefined
  >(initialClassroom?.status);
  const [generationStep, setGenerationStep] = useState<
    CourseChapterClassroom['generationStep']
  >(initialClassroom?.generationStep);
  const [sceneCount, setSceneCount] = useState(initialClassroom?.sceneCount ?? 0);
  const [failedReason, setFailedReason] = useState<string | null>(
    initialClassroom?.failedReason ?? null,
  );

  const sceneOutlinesRef = useRef(sceneOutlines);
  sceneOutlinesRef.current = sceneOutlines;
  const initialLoadDoneRef = useRef(false);

  const applyStatusPayload = useCallback((json: unknown) => {
    const classroom = parseChapterClassroomPayload(json);
    const status = classroom?.status ?? parseChapterClassroomStatus(json);
    const step = classroom?.generationStep ?? parseChapterClassroomGenerationStep(json);
    if (typeof classroom?.sceneCount === 'number') {
      setSceneCount(classroom.sceneCount);
    }
    setClassroomStatus(status);
    setGenerationStep(step);
    if (status === 'failed') {
      setFailedReason(parseChapterClassroomFailedReason(json) ?? null);
    } else {
      setFailedReason(null);
    }
    return { status, classroom };
  }, []);

  const syncFromServer = useCallback(
    async (options: { readonly generationActive: boolean; readonly generationFailed?: boolean }) => {
      await syncChapterStudioFromServer(classroomId, sceneOutlinesRef.current, {
        generationActive: options.generationActive,
        generationFailed: options.generationFailed,
      });
    },
    [classroomId],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      if (!initialLoadDoneRef.current) {
        useStageStore.getState().clearStore();
      }

      const statusRes = await fetch(
        `/api/extends/teacher/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}`,
      );
      let status: CourseChapterClassroom['status'] | undefined;
      let generationFailed = false;
      if (statusRes.ok) {
        const json: unknown = await statusRes.json();
        const parsed = applyStatusPayload(json);
        status = parsed.status;
        generationFailed = parsed.status === 'failed';
      }

      const isGenerating = status === 'generating';
      await syncFromServer({
        generationActive: isGenerating,
        generationFailed,
      });
      initialLoadDoneRef.current = true;
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [applyStatusPayload, chapterId, projectId, syncFromServer]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (loading || loadFailed) return;
    if (classroomStatus !== 'generating') return;

    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(
          `/api/extends/teacher/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}`,
        );
        if (!res.ok || cancelled) return;
        const json: unknown = await res.json();
        const { status } = applyStatusPayload(json);
        await syncFromServer({
          generationActive: status === 'generating',
          generationFailed: status === 'failed',
        });
      } catch {
        // ignore transient poll errors
      }
    };

    const timer = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [
    applyStatusPayload,
    chapterId,
    classroomStatus,
    loadFailed,
    loading,
    projectId,
    syncFromServer,
  ]);

  const totalScenes = sceneOutlines.length;
  const isGenerating = classroomStatus === 'generating';
  const generationFailed = classroomStatus === 'failed' && sceneCount < totalScenes;

  return {
    loading,
    loadFailed,
    classroomStatus,
    generationStep,
    sceneCount,
    totalScenes,
    isGenerating,
    generationFailed,
    failedReason,
    reload,
  };
}
