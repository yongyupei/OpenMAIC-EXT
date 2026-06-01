/**
 * @extends-from components/teacher/teacher-project-generate-shell.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { CourseEditorShell } from '@/components/course-editor/course-editor-shell';
import { GenerationProgressPanel } from '@/components/teacher/generation-progress-panel';
import type { GenerationChapterRow } from '@/components/teacher/design-workbench/generation-progress-dialog';
import { Button } from '@/components/ui/button';
import { MediaStageProvider } from '@/lib/contexts/media-stage-context';
import { ThemeProvider } from '@/lib/hooks/use-theme';
import { useI18n } from '@/lib/hooks/use-i18n';
import {
  buildCourseEditorChapterNavFromProject,
  getSortedOutlineChapters,
} from '@/lib/teacher/chapter-scene-order';
import {
  buildStageFromTeacherProject,
  getPublishableScenes,
  hasPreviewableGeneratedContent,
} from '@/lib/teacher/course-publish';
import {
  getTeacherGenerationHeaders,
  withCurrentTeacherThinkingConfig,
} from '@/lib/teacher/client-generation-config';
import {
  runGenerationScheduler,
  type ChapterStepStatus,
  type PublishResult,
  type StepResult,
} from '@/lib/teacher/generation-scheduler';
import { getTeacherStudioClassroomId } from '@/lib/teacher/get-editable-classroom-id';
import type { CourseProject } from '@/lib/teacher/course-types';
import { buildTeacherDesignPath, buildTeacherStudioPath } from '@/lib/teacher/routes';
import { useStageStore } from '@/lib/store/stage';

interface TeacherProjectGenerateShellProps {
  readonly initialProject: CourseProject;
  /** When set, only this chapter is generated before publish. */
  readonly focusChapterId?: string | null;
}

async function fetchTeacherProject(projectId: string): Promise<CourseProject | null> {
  const response = await fetch(`/api/extends/teacher/projects/${encodeURIComponent(projectId)}`);
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok || !json || typeof json !== 'object') return null;
  const record = json as Record<string, unknown>;
  if (record.success !== true || !record.project || typeof record.project !== 'object') return null;
  return record.project as CourseProject;
}

export function TeacherProjectGenerateShell({
  initialProject,
  focusChapterId = null,
}: TeacherProjectGenerateShellProps) {
  const { t } = useI18n();
  const projectId = initialProject.id;

  const [liveProject, setLiveProject] = useState<CourseProject>(initialProject);
  const [generationRows, setGenerationRows] = useState<GenerationChapterRow[]>([]);
  const [publishPhase, setPublishPhase] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationRunning, setGenerationRunning] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const [generationPanelVisible, setGenerationPanelVisible] = useState(true);

  const generationAbortRef = useRef<AbortController | null>(null);
  const projectIdRef = useRef(projectId);
  const initialProjectRef = useRef(initialProject);
  const focusChapterIdRef = useRef(focusChapterId);

  projectIdRef.current = projectId;
  initialProjectRef.current = initialProject;
  focusChapterIdRef.current = focusChapterId;

  const chapterNav = useMemo(
    () => buildCourseEditorChapterNavFromProject(liveProject),
    [liveProject],
  );

  const resetGenerationRows = useCallback(
    (chapters: ReturnType<typeof getSortedOutlineChapters>) => {
      setGenerationRows(
        chapters.map((chapter) => ({
          id: chapter.id,
          title: chapter.title.trim() || chapter.id,
          status: 'pending' as ChapterStepStatus,
        })),
      );
    },
    [],
  );

  const runPublish = useCallback(async (): Promise<PublishResult> => {
    const id = projectIdRef.current;
    const response = await fetch(`/api/extends/teacher/projects/${encodeURIComponent(id)}/publish`, {
      method: 'POST',
      headers: getTeacherGenerationHeaders(),
      body: JSON.stringify(withCurrentTeacherThinkingConfig({})),
    });
    const json = (await response.json()) as { success?: boolean; classroomId?: string };
    if (!response.ok || !json.success || typeof json.classroomId !== 'string') {
      return { ok: false, error: `publish failed: HTTP ${response.status}` };
    }
    return { ok: true, classroomId: json.classroomId };
  }, []);

  const runOutlineForChapter = useCallback(async (chapterId: string): Promise<StepResult> => {
    const id = projectIdRef.current;
    const response = await fetch(
      `/api/extends/teacher/projects/${encodeURIComponent(id)}/generate-outline`,
      {
        method: 'POST',
        headers: getTeacherGenerationHeaders(),
        body: JSON.stringify(withCurrentTeacherThinkingConfig({ chapterId })),
      },
    );
    if (!response.ok) {
      return { ok: false, error: `outline HTTP ${response.status}` };
    }
    return { ok: true };
  }, []);

  const syncProjectToStageStore = useCallback((project: CourseProject) => {
    const serverScenes = getPublishableScenes(project);
    const stage = buildStageFromTeacherProject(project, serverScenes, Date.now());
    const store = useStageStore.getState();
    const existingStage = store.stage;

    store.setStage(
      existingStage
        ? {
            ...existingStage,
            name: stage.name,
            description: stage.description,
            languageDirective: stage.languageDirective,
            updatedAt: stage.updatedAt,
          }
        : stage,
    );

    const localById = new Map(store.scenes.map((scene) => [scene.id, scene]));
    const mergedFromServer = serverScenes.map((serverScene) => {
      const local = localById.get(serverScene.id);
      if (!local) return serverScene;
      const localUpdated = local.updatedAt ?? 0;
      const serverUpdated = serverScene.updatedAt ?? 0;
      return localUpdated >= serverUpdated ? local : serverScene;
    });
    const serverIds = new Set(serverScenes.map((scene) => scene.id));
    const localOnlyScenes = store.scenes.filter((scene) => !serverIds.has(scene.id));
    const allScenes = [...mergedFromServer, ...localOnlyScenes].map((scene, order) => ({
      ...scene,
      order,
    }));

    useStageStore.setState({
      scenes: allScenes,
      currentSceneId: (() => {
        const prev = store.currentSceneId;
        if (prev && allScenes.some((scene) => scene.id === prev)) return prev;
        return allScenes[0]?.id ?? null;
      })(),
    });
  }, []);

  const refreshProjectFromServer = useCallback(async (): Promise<CourseProject | null> => {
    const next = await fetchTeacherProject(projectIdRef.current);
    if (next) {
      setLiveProject(next);
      syncProjectToStageStore(next);
    }
    return next;
  }, [syncProjectToStageStore]);

  const publishIncremental = useCallback(async (): Promise<PublishResult> => {
    const current = await fetchTeacherProject(projectIdRef.current);
    if (!current || !hasPreviewableGeneratedContent(current)) {
      return { ok: false, error: 'no previewable content to publish' };
    }

    const existingClassroomId = getTeacherStudioClassroomId(current, projectIdRef.current);
    if (existingClassroomId) {
      return { ok: true, classroomId: existingClassroomId };
    }

    setPublishPhase(true);
    try {
      return await runPublish();
    } finally {
      setPublishPhase(false);
    }
  }, [runPublish]);

  const runChapterScenes = useCallback(
    async (chapterId: string): Promise<StepResult> => {
      const id = projectIdRef.current;
      const response = await fetch(
        `/api/extends/teacher/projects/${encodeURIComponent(id)}/generate-chapter`,
        {
          method: 'POST',
          headers: getTeacherGenerationHeaders(),
          body: JSON.stringify(withCurrentTeacherThinkingConfig({ chapterId })),
        },
      );
      if (!response.ok) {
        return { ok: false, error: `chapter HTTP ${response.status}` };
      }

      await refreshProjectFromServer();
      const publishResult = await publishIncremental();
      await refreshProjectFromServer();
      if (!publishResult.ok) {
        return { ok: true };
      }
      return { ok: true };
    },
    [publishIncremental, refreshProjectFromServer],
  );

  useEffect(() => {
    syncProjectToStageStore(liveProject);
  }, [liveProject, syncProjectToStageStore]);

  useEffect(() => {
    return () => {
      useStageStore.getState().clearStore();
    };
  }, []);

  useEffect(() => {
    if (!generationRunning) return;
    const timer = window.setInterval(() => {
      void refreshProjectFromServer();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [generationRunning, refreshProjectFromServer]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    generationAbortRef.current = controller;

    void (async () => {
      const fresh = (await fetchTeacherProject(projectId)) ?? initialProjectRef.current;
      if (!active) return;
      setLiveProject(fresh);
      if (hasPreviewableGeneratedContent(fresh)) {
        syncProjectToStageStore(fresh);
      }

      const allChapters = getSortedOutlineChapters(fresh);
      const focusId = focusChapterIdRef.current?.trim();
      const chapters = focusId
        ? allChapters.filter((chapter) => chapter.id === focusId)
        : allChapters;
      if (chapters.length === 0) {
        setGenerationError(
          focusId
            ? t('teacher.create.generateWorkbench.missingChapter')
            : t('teacher.create.generateWorkbench.missingOutline'),
        );
        return;
      }

      setGenerationError(null);
      resetGenerationRows(chapters);
      setPublishPhase(false);
      setGenerationRunning(true);

      let result: Awaited<ReturnType<typeof runGenerationScheduler>>;
      try {
        result = await runGenerationScheduler({
          chapters: chapters.map((chapter) => ({ id: chapter.id, title: chapter.title })),
          generateOutline: runOutlineForChapter,
          generateScenes: runChapterScenes,
          publish: publishIncremental,
          onChapterStatus: (chapterId, status) => {
            setGenerationRows((rows) =>
              rows.map((row) => (row.id === chapterId ? { ...row, status } : row)),
            );
            if (status === 'ready') {
              void refreshProjectFromServer();
            }
          },
          signal: controller.signal,
        });
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught);
        result = { outcome: 'failed', failedStep: 'outline', error: message };
      } finally {
        if (active) setGenerationRunning(false);
      }

      if (!active) return;

      await refreshProjectFromServer();

      if (result.outcome === 'cancelled') {
        setGenerationError(t('teacher.create.designWorkbench.generationCancelled'));
        return;
      }

      if (result.outcome === 'failed') {
        setGenerationError(
          result.error ??
            t('teacher.create.designWorkbench.generationFailedGeneric', {
              step: result.failedStep ?? 'unknown',
            }),
        );
        return;
      }

      setGenerationError(null);
    })();

    return () => {
      active = false;
      controller.abort();
      setGenerationRunning(false);
      if (generationAbortRef.current === controller) {
        generationAbortRef.current = null;
      }
    };
  }, [
    projectId,
    publishIncremental,
    refreshProjectFromServer,
    resetGenerationRows,
    retryKey,
    runChapterScenes,
    runOutlineForChapter,
    syncProjectToStageStore,
    focusChapterId,
    t,
  ]);

  const cancelGeneration = useCallback(() => {
    generationAbortRef.current?.abort();
  }, []);

  const retryGeneration = useCallback(() => {
    setGenerationError(null);
    setRetryKey((key) => key + 1);
  }, []);

  const studioClassroomId = getTeacherStudioClassroomId(liveProject, projectId);
  const canPreviewNow = hasPreviewableGeneratedContent(liveProject);
  const studioChapterId = focusChapterId?.trim() || undefined;

  const toolbarLeadingExtra = (
    <>
      <Button type="button" asChild variant="outline" size="sm">
        <Link href="/">{t('courseEditor.backToHome')}</Link>
      </Button>
      <Button type="button" asChild variant="outline" size="sm">
        <Link href={buildTeacherDesignPath(projectId)}>
          {t('teacher.create.generateWorkbench.backToPreviousStep')}
        </Link>
      </Button>
      {generationRunning ? (
        <Button type="button" variant="outline" size="sm" onClick={cancelGeneration}>
          {t('teacher.create.generateWorkbench.cancelGeneration')}
        </Button>
      ) : null}
      {canPreviewNow && studioClassroomId ? (
        <Button type="button" asChild variant="default" size="sm">
          <Link
            href={buildTeacherStudioPath(
              projectId,
              studioChapterId ? { chapterId: studioChapterId } : undefined,
            )}
          >
            {t('teacher.create.generateWorkbench.openStudio')}
          </Link>
        </Button>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setGenerationPanelVisible((visible) => !visible)}
      >
        {generationPanelVisible
          ? t('teacher.create.generateWorkbench.hideGenerationProgress')
          : t('teacher.create.generateWorkbench.showGenerationProgress')}
      </Button>
    </>
  );

  return (
    <ThemeProvider>
      <MediaStageProvider value={projectId}>
        <div className="flex h-[100dvh] min-h-0 w-full overflow-hidden bg-gray-50 dark:bg-gray-900">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <CourseEditorShell
              classroomId={projectId}
              chapterNav={chapterNav}
              toolbarLeadingExtra={toolbarLeadingExtra}
            />
          </div>
          {generationPanelVisible ? (
            <aside
              className="flex w-80 shrink-0 min-h-0 flex-col overflow-hidden border-l bg-background"
              aria-label={t('teacher.create.designWorkbench.generationDialogTitle')}
            >
              <GenerationProgressPanel
                chapters={generationRows}
                publishPhase={publishPhase}
                errorMessage={generationError}
                onRetry={!generationRunning && generationError ? retryGeneration : undefined}
              />
            </aside>
          ) : null}
        </div>
      </MediaStageProvider>
    </ThemeProvider>
  );
}
