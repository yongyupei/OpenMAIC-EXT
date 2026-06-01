/**
 * @extends-from components/teacher/chapter-generate-shell.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import '@/components/extends/extends-bootstrap-side-effect';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

import type { SceneOutline } from '@/lib/types/generation';

import {
  getTeacherGenerationHeadersForChapter,
  resolveChapterGenerationModelConfig,
  type ResolvedChapterModelContext,
} from '@/lib/extends/teacher/resolve-chapter-model-config';
import { withTeacherThinkingConfig } from '@/lib/teacher/client-generation-config';
import type { GenerationProfile, GenerationProfileOverride } from '@/lib/teacher/generation-profile';
import {
  parseChapterClassroomFailedReason,
  parseChapterClassroomFailedStep,
  parseChapterClassroomGenerationStep,
  parseChapterClassroomPayload,
  parseChapterClassroomStatus,
  parseTeacherApiErrorMessage,
} from '@/lib/teacher/chapter-classroom-api';
import { resolveChapterGenerateStartAction } from '@/lib/teacher/chapter-generate-precheck';
import {
  deriveChapterGenerationPhase,
  type ChapterGenerationPhase,
} from '@/lib/teacher/chapter-generation-flow';
import { buildChapterStudioPath, buildTeacherDesignPath } from '@/lib/teacher/routes';
import type { CourseChapterClassroomGenerationStep } from '@/lib/teacher/course-types';
import { ChapterGenerationProgressCard } from '@/components/teacher/chapter-generation-progress-card';
import { useI18n } from '@/lib/hooks/use-i18n';

interface ChapterGenerateShellProps {
  readonly projectId: string;
  readonly chapterId: string;
  readonly chapterTitle: string;
  readonly chapterOrder: number;
  /** When false, skip the initial POST and go straight to poll mode. Defaults to true. */
  readonly autoStart?: boolean;
}

const POLL_INTERVAL_MS = 3000;

export function ChapterGenerateShell({
  projectId,
  chapterId,
  chapterTitle,
  chapterOrder,
  autoStart = true,
}: ChapterGenerateShellProps) {
  const { t } = useI18n();
  const tRef = useRef(t);
  tRef.current = t;
  const router = useRouter();
  const searchParams = useSearchParams();
  const resumeGeneration = searchParams.get('resume') === '1';
  const regenerateGeneration = searchParams.get('regenerate') === '1';
  const [phase, setPhase] = useState<ChapterGenerationPhase>('outlining');
  const [activeStepType, setActiveStepType] = useState<
    CourseChapterClassroomGenerationStep | undefined
  >('outline');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastTraceId, setLastTraceId] = useState<string | undefined>(undefined);
  const [sceneCount, setSceneCount] = useState(0);
  const [totalScenes, setTotalScenes] = useState<number | undefined>();
  const [pendingOutlines, setPendingOutlines] = useState<SceneOutline[]>([]);
  const [approvingOutline, setApprovingOutline] = useState(false);
  const pendingOutlinesRef = useRef<SceneOutline[]>([]);
  const retryRef = useRef<(() => void) | null>(null);
  const approveRef = useRef<(() => void) | null>(null);
  const [chapterModelSource, setChapterModelSource] = useState<
    ResolvedChapterModelContext | undefined
  >();
  const chapterModelSourceRef = useRef(chapterModelSource);
  chapterModelSourceRef.current = chapterModelSource;

  const loadChapterModelSource = useCallback(async (): Promise<ResolvedChapterModelContext> => {
    try {
      const res = await fetch(`/api/extends/teacher/projects/${encodeURIComponent(projectId)}`);
      if (!res.ok) return chapterModelSourceRef.current ?? {};
      const json = (await res.json()) as {
        project?: {
          generationProfile?: GenerationProfile;
          outline?: {
            chapters?: Array<{
              id: string;
              sceneOutlines?: unknown[];
              generationProfileOverride?: GenerationProfileOverride;
            }>;
          };
        };
      };
      const chapter = json.project?.outline?.chapters?.find((c) => c.id === chapterId);
      const source: ResolvedChapterModelContext = {
        generationProfileOverride: chapter?.generationProfileOverride,
        generationProfile: json.project?.generationProfile,
      };
      const outlineCount = chapter?.sceneOutlines?.length;
      if (typeof outlineCount === 'number' && outlineCount > 0) {
        setTotalScenes(outlineCount);
      }
      setChapterModelSource(source);
      chapterModelSourceRef.current = source;
      return source;
    } catch {
      return chapterModelSourceRef.current ?? {};
    }
  }, [projectId, chapterId]);

  const handlePendingOutlinesChange = useCallback((next: SceneOutline[]) => {
    pendingOutlinesRef.current = next;
    setPendingOutlines(next);
  }, []);

  const fetchPendingOutlines = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(`/api/extends/teacher/projects/${encodeURIComponent(projectId)}`);
      if (!res.ok) return;
      const json = (await res.json()) as {
        project?: {
          generationProfile?: GenerationProfile;
          outline?: {
            chapters?: Array<{
              id: string;
              sceneOutlines?: SceneOutline[];
              generationProfileOverride?: GenerationProfileOverride;
            }>;
          };
        };
      };
      const chapter = json.project?.outline?.chapters?.find((c) => c.id === chapterId);
      setChapterModelSource({
        generationProfileOverride: chapter?.generationProfileOverride,
        generationProfile: json.project?.generationProfile,
      });
      const outlines = chapter?.sceneOutlines;
      if (Array.isArray(outlines) && outlines.length > 0) {
        pendingOutlinesRef.current = outlines;
        setPendingOutlines(outlines);
        setTotalScenes(outlines.length);
      }
    } catch {
      // ignore — UI degrades to button-only review
    }
  }, [projectId, chapterId]);

  const studioPath = buildChapterStudioPath(projectId, chapterId);
  const designPath = buildTeacherDesignPath(projectId);
  const statusUrl = `/api/extends/teacher/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}`;

  useEffect(() => {
    if (phase !== 'ready') return;
    const timer = setTimeout(() => {
      router.push(studioPath);
    }, 1200);
    return () => clearTimeout(timer);
  }, [phase, router, studioPath]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await loadChapterModelSource();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadChapterModelSource]);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let pollActive = false;

    const clearTimers = () => {
      if (pollTimer !== null) clearTimeout(pollTimer);
      pollActive = false;
    };

    const applyServerPayload = (json: unknown): 'terminal' | 'active' | 'unknown' => {
      const classroom = parseChapterClassroomPayload(json);
      const status = classroom?.status ?? parseChapterClassroomStatus(json);
      const generationStep =
        classroom?.generationStep ?? parseChapterClassroomGenerationStep(json);

      if (typeof classroom?.sceneCount === 'number') {
        setSceneCount(classroom.sceneCount);
      }

      if (typeof classroom?.lastTraceId === 'string' && classroom.lastTraceId.trim()) {
        setLastTraceId(classroom.lastTraceId.trim());
      }

      if (generationStep) {
        setActiveStepType(generationStep);
      }

      if (status === 'ready' || status === 'published') {
        setPhase('ready');
        setActiveStepType(undefined);
        return 'terminal';
      }

      if (status === 'failed') {
        setPhase('failed');
        setErrorMessage(
          parseChapterClassroomFailedReason(json) ?? tRef.current('teacher.chapter.status.failed'),
        );
        const failedStep = parseChapterClassroomFailedStep(json);
        if (failedStep === 'outline') {
          setActiveStepType('outline');
        } else if (failedStep === 'scenes') {
          setActiveStepType('scene-content');
        }
        return 'terminal';
      }

      if (status === 'awaiting-outline-approval') {
        setPhase('awaiting-approval');
        setActiveStepType('outline');
        void fetchPendingOutlines();
        return 'terminal';
      }

      if (status === 'generating') {
        setPhase(deriveChapterGenerationPhase(status, generationStep));
        if (generationStep) {
          setActiveStepType(generationStep);
        }
        return 'active';
      }

      return 'unknown';
    };

    const poll = async () => {
      if (cancelled || !pollActive) return;
      try {
        const res = await fetch(statusUrl);
        if (cancelled || !pollActive) return;
        if (res.ok) {
          const json: unknown = await res.json();
          const outcome = applyServerPayload(json);
          if (outcome === 'terminal') {
            pollActive = false;
            return;
          }
        }
      } catch {
        // ignore transient network errors; keep polling
      }
      if (!cancelled && pollActive) {
        pollTimer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
      }
    };

    const startPolling = () => {
      if (cancelled) return;
      pollActive = true;
      setPhase('outlining');
      setActiveStepType('outline');
      setErrorMessage(null);
      pollTimer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
    };

    const runGeneratePost = async (body: Record<string, unknown>) => {
      pollActive = true;
      setPhase('outlining');
      setActiveStepType('outline');
      setErrorMessage(null);
      pollTimer = setTimeout(() => void poll(), POLL_INTERVAL_MS);

      const response = await fetch(
        `/api/extends/teacher/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/generate`,
        {
          method: 'POST',
          headers: getTeacherGenerationHeadersForChapter(chapterModelSourceRef.current),
          body: JSON.stringify(
            withTeacherThinkingConfig(
              body,
              resolveChapterGenerationModelConfig(chapterModelSourceRef.current)
                .thinkingConfig,
            ),
          ),
        },
      );

      if (!response.ok) {
        pollActive = false;
        const json: unknown = await response.json().catch(() => null);
        throw new Error(parseTeacherApiErrorMessage(json, `HTTP ${response.status}`));
      }

      const json: unknown = await response.json().catch(() => null);
      if (
        json &&
        typeof json === 'object' &&
        'missingTemplateIds' in json &&
        Array.isArray(json.missingTemplateIds) &&
        json.missingTemplateIds.length > 0
      ) {
        toast.warning(
          tRef.current('slideTemplates.missingTemplateWarning', {
            ids: json.missingTemplateIds.join(', '),
          }),
        );
      }

      if (
        json &&
        typeof json === 'object' &&
        'status' in json &&
        json.status === 'awaiting-outline-approval'
      ) {
        pollActive = false;
        setPhase('awaiting-approval');
        setActiveStepType('outline');
        void fetchPendingOutlines();
        return;
      }

      if (
        json &&
        typeof json === 'object' &&
        'status' in json &&
        json.status === 'generating'
      ) {
        return;
      }

      if (
        json &&
        typeof json === 'object' &&
        'sceneCount' in json &&
        typeof json.sceneCount === 'number'
      ) {
        pollActive = false;
        setSceneCount(json.sceneCount);
        setPhase('ready');
        setActiveStepType(undefined);
        return;
      }

      return;
    };

    const generate = async () => {
      if (cancelled) return;

      try {
        const checkRes = await fetch(statusUrl);
        if (checkRes.ok) {
          const checkJson: unknown = await checkRes.json();
          const classroom = parseChapterClassroomPayload(checkJson);
          const serverStatus = classroom?.status ?? parseChapterClassroomStatus(checkJson);
          const startAction = resolveChapterGenerateStartAction(
            serverStatus,
            {
              resume: resumeGeneration,
              regenerate: regenerateGeneration,
            },
            classroom,
          );
          if (startAction === 'redirect-studio') {
            if (!cancelled) router.push(studioPath);
            return;
          }
          if (startAction === 'poll') {
            startPolling();
            return;
          }
          if (startAction === 'awaiting-outline-approval') {
            if (!cancelled) {
              setPhase('awaiting-approval');
              setActiveStepType('outline');
              void fetchPendingOutlines();
            }
            return;
          }
        }
      } catch {
        // ignore; fall through to POST
      }

      if (cancelled) return;

      await loadChapterModelSource();
      if (cancelled) return;

      try {
        await runGeneratePost({
          resume: resumeGeneration,
          regenerate: regenerateGeneration,
        });
      } catch (err) {
        if (!cancelled) {
          setPhase('failed');
          setErrorMessage(err instanceof Error ? err.message : 'Unknown error');
        }
      }
    };

    const continueAfterOutlineApproval = async () => {
      if (cancelled) return;
      setApprovingOutline(true);
      try {
        await loadChapterModelSource();
        if (cancelled) return;
        const edited = pendingOutlinesRef.current;
        await runGeneratePost({
          approveOutline: true,
          resume: true,
          ...(edited && edited.length > 0 ? { sceneOutlines: edited } : {}),
        });
      } catch (err) {
        if (!cancelled) {
          setPhase('failed');
          setErrorMessage(err instanceof Error ? err.message : 'Unknown error');
        }
      } finally {
        if (!cancelled) setApprovingOutline(false);
      }
    };

    retryRef.current = () => {
      cancelled = false;
      void generate();
    };
    approveRef.current = () => {
      cancelled = false;
      void continueAfterOutlineApproval();
    };

    if (autoStart === false) {
      startPolling();
    } else {
      void generate();
    }

    return () => {
      cancelled = true;
      clearTimers();
    };
  }, [
    autoStart,
    chapterId,
    fetchPendingOutlines,
    loadChapterModelSource,
    projectId,
    regenerateGeneration,
    resumeGeneration,
    router,
    statusUrl,
    studioPath,
  ]);

  return (
    <ChapterGenerationProgressCard
      phase={phase}
      activeStepType={activeStepType}
      chapterTitle={chapterTitle}
      chapterOrder={chapterOrder}
      errorMessage={errorMessage}
      sceneCount={sceneCount}
      totalScenes={totalScenes}
      resumeGeneration={resumeGeneration}
      backHref={designPath}
      studioHref={studioPath}
      showStudioButton={phase === 'ready' || sceneCount >= 1}
      pendingOutlines={pendingOutlines}
      onPendingOutlinesChange={handlePendingOutlinesChange}
      approvingOutline={approvingOutline}
      onBack={() => router.push(designPath)}
      onRetry={() => retryRef.current?.()}
      onApproveOutline={() => approveRef.current?.()}
      lastTraceId={lastTraceId}
    />
  );
}
