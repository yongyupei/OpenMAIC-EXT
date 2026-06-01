/**
 * @extends-from components/teacher/teacher-preview-shell.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { nanoid } from 'nanoid';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertCircle, RefreshCw, ArrowLeft, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useStageStore } from '@/lib/store/stage';
import { useSettingsStore } from '@/lib/store/settings';
import { useSceneGenerator } from '@/lib/hooks/use-scene-generator';
import { getCurrentModelConfig } from '@/lib/utils/model-config';
import { buildVideoManifestFromOutlines } from '@/lib/media/video-manifest';
import { buildChapterHints, buildRequirementsFromProject } from '@/lib/teacher/preview-helpers';
import type { ChapterHint } from '@/lib/teacher/preview-helpers';
import { buildTeacherDesignPath, buildTeacherStudioPath } from '@/lib/teacher/routes';
import type { CourseProject } from '@/lib/teacher/course-types';
import type { SceneOutline, UserRequirements } from '@/lib/types/generation';
import { useI18n } from '@/lib/hooks/use-i18n';
import { StepVisualizer } from '@/app/generation-preview/components/visualizers';
import { deleteStageWithRelatedData } from '@/lib/utils/database';
import {
  clearTeacherPreviewBinding,
  readTeacherPreviewBinding,
  updateTeacherPreviewGenParams,
  writeTeacherPreviewBinding,
} from '@/lib/teacher/preview-binding';
import { teacherPreviewEntryShouldGate } from '@/lib/teacher/preview-resume-helpers';
import {
  TeacherPreviewGate,
  type TeacherPreviewGateMode,
} from '@/components/teacher/teacher-preview-gate';

type Phase = 'streaming-outlines' | 'generating-scenes' | 'publishing' | 'done' | 'error';

function withThinkingConfig<T extends Record<string, unknown>>(body: T): T {
  const { thinkingConfig } = getCurrentModelConfig();
  return thinkingConfig ? ({ ...body, thinkingConfig } as T) : body;
}

function getApiHeaders(): HeadersInit {
  const config = getCurrentModelConfig();
  const settings = useSettingsStore.getState();
  const imageProviderConfig = settings.imageProvidersConfig?.[settings.imageProviderId];
  const videoProviderConfig = settings.videoProvidersConfig?.[settings.videoProviderId];

  return {
    'Content-Type': 'application/json',
    'x-model': config.modelString || '',
    'x-api-key': config.apiKey || '',
    'x-base-url': config.baseUrl || '',
    'x-provider-type': config.providerType || '',
    'x-image-provider': settings.imageProviderId || '',
    'x-image-model': settings.imageModelId || '',
    'x-image-api-key': imageProviderConfig?.apiKey || '',
    'x-image-base-url': imageProviderConfig?.baseUrl || '',
    'x-video-provider': settings.videoProviderId || '',
    'x-video-model': settings.videoModelId || '',
    'x-video-api-key': videoProviderConfig?.apiKey || '',
    'x-video-base-url': videoProviderConfig?.baseUrl || '',
    'x-image-generation-enabled': String(settings.imageGenerationEnabled ?? false),
    'x-video-generation-enabled': String(settings.videoGenerationEnabled ?? false),
  };
}

async function streamOutlines(
  requirements: UserRequirements,
  presetChapters: ChapterHint[] | undefined,
  signal: AbortSignal,
  onOutline: (outlines: SceneOutline[]) => void,
  onOutlineStreamRetry?: () => void,
): Promise<{ outlines: SceneOutline[]; languageDirective: string }> {
  return new Promise((resolve, reject) => {
    const collected: SceneOutline[] = [];
    let directive = '';

    fetch('/api/extends/generate/scene-outlines-stream', {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify(
        withThinkingConfig({
          requirements,
          ...(presetChapters && presetChapters.length > 0 ? { presetChapters } : {}),
        }),
      ),
      signal,
    })
      .then((res) => {
        if (!res.ok) {
          return res
            .json()
            .then((d: { error?: string }) => {
              reject(new Error(d.error || `Outline stream failed: HTTP ${res.status}`));
            })
            .catch(() => {
              reject(new Error(`Outline stream failed: HTTP ${res.status}`));
            });
        }

        const reader = res.body?.getReader();
        if (!reader) {
          reject(new Error('Response body is not readable'));
          return;
        }

        const decoder = new TextDecoder();
        let sseBuffer = '';

        const pump = (): Promise<void> =>
          reader.read().then(({ done, value }) => {
            if (value) {
              sseBuffer += decoder.decode(value, { stream: !done });
              const lines = sseBuffer.split('\n').map((l) => l.replace(/\r$/, ''));
              sseBuffer = lines.pop() || '';

              for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                try {
                  const evt = JSON.parse(line.slice(6)) as {
                    type: string;
                    data?: SceneOutline;
                    outlines?: SceneOutline[];
                    languageDirective?: string;
                    error?: string;
                  };

                  if (evt.type === 'languageDirective') {
                    directive = (evt as unknown as { data: string }).data ?? '';
                  } else if (evt.type === 'outline' && evt.data) {
                    collected.push(evt.data);
                    onOutline([...collected]);
                  } else if (evt.type === 'retry') {
                    collected.length = 0;
                    onOutline([]);
                    onOutlineStreamRetry?.();
                  } else if (evt.type === 'done') {
                    directive = evt.languageDirective || directive;
                    reader.cancel().catch(() => {});
                    resolve({
                      outlines: evt.outlines || collected,
                      languageDirective:
                        directive || 'Teach in the language that matches the user requirement.',
                    });
                    return;
                  } else if (evt.type === 'error') {
                    reject(new Error(evt.error || 'Outline generation failed'));
                    return;
                  }
                } catch {
                  // ignore malformed SSE lines
                }
              }
            }

            if (done) {
              if (collected.length > 0) {
                resolve({
                  outlines: collected,
                  languageDirective:
                    directive || 'Teach in the language that matches the user requirement.',
                });
              } else {
                reject(new Error('Outline stream ended without producing outlines'));
              }
              return;
            }

            return pump();
          });

        pump().catch(reject);
      })
      .catch(reject);
  });
}

interface Props {
  project: CourseProject;
  chapterId?: string;
}

export function TeacherPreviewShell({ project, chapterId }: Props) {
  const router = useRouter();
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>('streaming-outlines');
  const [streamingOutlines, setStreamingOutlines] = useState<SceneOutline[]>([]);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState('');
  const [sceneVizStepId, setSceneVizStepId] = useState<'slide-content' | 'actions'>(
    'slide-content',
  );
  const [railStepIndex, setRailStepIndex] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [showGate, setShowGate] = useState(false);
  const [gateMode, setGateMode] = useState<TeacherPreviewGateMode>('resume');
  const [runNonce, setRunNonce] = useState(0);
  const [publishedSceneCount, setPublishedSceneCount] = useState<number | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const pendingPipelineRef = useRef<'full' | 'resume'>('full');
  const lastPipelineKindRef = useRef<'full' | 'resume'>('full');
  /** Avoid stale closures while keeping pipeline callbacks stable across parent re-renders. */
  const projectRef = useRef(project);
  projectRef.current = project;
  const chapterIdRef = useRef(chapterId);
  chapterIdRef.current = chapterId;

  const outlines = useStageStore.use.outlines();
  const scenes = useStageStore.use.scenes();

  const onSceneGeneratorPhaseChange = useCallback((apiPhase: 'content' | 'actions') => {
    setSceneVizStepId(apiPhase === 'content' ? 'slide-content' : 'actions');
  }, []);

  const { generateRemaining, stop } = useSceneGenerator({
    onPhaseChange: onSceneGeneratorPhaseChange,
  });

  const publishClassroom = useCallback(
    async (signal: AbortSignal) => {
      setPhase('publishing');
      setRailStepIndex(2);
      const { stage, scenes: finalScenes } = useStageStore.getState();
      if (!stage) throw new Error('Stage not found after generation');

      const publishRes = await fetch(
        `/api/extends/teacher/projects/${encodeURIComponent(project.id)}/publish-classroom`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stage, scenes: finalScenes }),
          signal,
        },
      );

      if (!publishRes.ok) {
        const data = await publishRes.json().catch(() => ({ error: 'Publish failed' }));
        throw new Error(
          (data as { error?: string }).error || `Publish failed: HTTP ${publishRes.status}`,
        );
      }

      setPhase('done');
      router.push(buildTeacherStudioPath(project.id, { chapterId }));
    },
    [project.id, chapterId, router],
  );

  const runResumePipeline = useCallback(
    async (signal: AbortSignal) => {
      const p = projectRef.current;
      const ch = chapterIdRef.current;
      try {
        setStatusMessage('');
        setErrorMessage('');
        setStreamingOutlines([]);
        setRailStepIndex(1);
        setSceneVizStepId('slide-content');
        setPhase('generating-scenes');

        const { stage, outlines: ol } = useStageStore.getState();
        if (!stage || ol.length === 0) {
          throw new Error(t('teacher.preview.resumeMissingDraft'));
        }

        const binding = readTeacherPreviewBinding(p.id, ch);
        const mergedDirective =
          stage.languageDirective ||
          p.outline?.languageDirective ||
          binding?.genParams?.languageDirective ||
          '';

        await generateRemaining({
          stageInfo: {
            name: p.title,
            description: p.overview ?? '',
            style: 'professional',
          },
          languageDirective: mergedDirective,
          agents: binding?.genParams?.agents,
          userProfile: binding?.genParams?.userProfile,
        });

        if (signal.aborted) return;

        const status = useStageStore.getState().generationStatus;
        if (status !== 'completed') {
          throw new Error(t('teacher.preview.sceneGenFailed'));
        }

        await useStageStore.getState().saveToStorage();
        await publishClassroom(signal);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setErrorMessage(err instanceof Error ? err.message : 'Unknown error');
        setPhase('error');
      }
    },
    [generateRemaining, publishClassroom, t],
  );

  const runFullPipeline = useCallback(
    async (signal: AbortSignal) => {
      const p = projectRef.current;
      const ch = chapterIdRef.current;
      try {
        setStatusMessage('');
        setErrorMessage('');
        setRailStepIndex(0);
        setSceneVizStepId('slide-content');

        const stageId = nanoid();
        writeTeacherPreviewBinding(p.id, ch, stageId);

        useStageStore.getState().setStage({
          id: stageId,
          name: p.title,
          description: p.overview ?? '',
          style: 'professional',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        useStageStore.getState().setOutlines([]);
        await useStageStore.getState().saveToStorage();

        setPhase('streaming-outlines');
        const requirements = buildRequirementsFromProject(p);
        const chapters = p.outline?.chapters ?? [];
        const presetChapters = chapters.length > 0 ? buildChapterHints(chapters) : undefined;

        const { outlines: generatedOutlines, languageDirective } = await streamOutlines(
          requirements,
          presetChapters,
          signal,
          setStreamingOutlines,
          () => setStatusMessage(t('generation.outlineRetrying')),
        );

        if (signal.aborted) return;

        const mergedDirective = languageDirective || p.outline?.languageDirective || '';

        useStageStore.getState().setOutlines(generatedOutlines);
        const stageAfterOutline = useStageStore.getState().stage;
        if (stageAfterOutline) {
          useStageStore.getState().setStage({
            ...stageAfterOutline,
            videoManifest: buildVideoManifestFromOutlines(generatedOutlines),
            languageDirective: mergedDirective,
            updatedAt: Date.now(),
          });
        }

        updateTeacherPreviewGenParams(p.id, ch, {
          languageDirective: mergedDirective,
        });
        await useStageStore.getState().saveToStorage();

        setPhase('generating-scenes');
        setRailStepIndex(1);

        await generateRemaining({
          stageInfo: {
            name: p.title,
            description: p.overview ?? '',
            style: 'professional',
          },
          languageDirective: mergedDirective,
        });

        if (signal.aborted) return;

        const status = useStageStore.getState().generationStatus;
        if (status !== 'completed') {
          throw new Error(t('teacher.preview.sceneGenFailed'));
        }

        await useStageStore.getState().saveToStorage();
        await publishClassroom(signal);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setErrorMessage(err instanceof Error ? err.message : 'Unknown error');
        setPhase('error');
      }
    },
    [generateRemaining, publishClassroom, t],
  );

  const runFullPipelineRef = useRef(runFullPipeline);
  const runResumePipelineRef = useRef(runResumePipeline);
  runFullPipelineRef.current = runFullPipeline;
  runResumePipelineRef.current = runResumePipeline;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      useStageStore.getState().clearStore();
      let pubCount: number | null = null;
      if (project.publishedClassroomId) {
        try {
          const res = await fetch(
            `/api/classroom?id=${encodeURIComponent(project.publishedClassroomId)}`,
          );
          if (res.ok) {
            const j = (await res.json()) as {
              success?: boolean;
              classroom?: { scenes?: unknown[] };
            };
            if (j.success && Array.isArray(j.classroom?.scenes)) {
              pubCount = j.classroom!.scenes!.length;
            }
          }
        } catch {
          // ignore
        }
      }
      if (cancelled) return;
      setPublishedSceneCount(pubCount);
      if (cancelled) return;

      const binding = readTeacherPreviewBinding(project.id, chapterId);
      let draftLoaded = false;
      if (binding?.stageId) {
        try {
          await useStageStore.getState().loadFromStorage(binding.stageId);
          const { stage, outlines: ol } = useStageStore.getState();
          if (!stage || stage.id !== binding.stageId || ol.length === 0) {
            clearTeacherPreviewBinding(project.id, chapterId);
            useStageStore.getState().clearStore();
          } else {
            draftLoaded = true;
          }
        } catch {
          clearTeacherPreviewBinding(project.id, chapterId);
          useStageStore.getState().clearStore();
        }
      }
      if (cancelled) return;

      const { stage, outlines: ol, scenes, generationStatus } = useStageStore.getState();
      const hasPublishedContent = Boolean(project.publishedClassroomId);
      const draftShouldGate =
        draftLoaded && ol.length > 0 && teacherPreviewEntryShouldGate(ol, scenes, generationStatus);

      if (draftShouldGate) {
        setGateMode(hasPublishedContent ? 'draft-and-published' : 'resume');
        setShowGate(true);
      } else if (!draftLoaded && !stage && hasPublishedContent) {
        setGateMode('published-only');
        setShowGate(true);
      } else {
        setShowGate(false);
        pendingPipelineRef.current = 'full';
        lastPipelineKindRef.current = 'full';
      }
      if (cancelled) return;
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [project.id, project.publishedClassroomId, chapterId]);

  useEffect(() => {
    if (!hydrated || showGate) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const kind = pendingPipelineRef.current;
    lastPipelineKindRef.current = kind;

    const run = kind === 'resume' ? runResumePipelineRef.current : runFullPipelineRef.current;
    void run(controller.signal);

    return () => {
      controller.abort();
      stop();
    };
  }, [hydrated, showGate, runNonce, stop, project.id, chapterId]);

  const handleRetry = useCallback(() => {
    abortControllerRef.current?.abort();
    stop();
    setStreamingOutlines([]);
    setErrorMessage('');
    setStatusMessage('');
    setPhase('streaming-outlines');
    setRailStepIndex(0);
    pendingPipelineRef.current = lastPipelineKindRef.current;
    setRunNonce((n) => n + 1);
  }, [stop]);

  const goBackToDesign = useCallback(() => {
    abortControllerRef.current?.abort();
    stop();
    router.push(buildTeacherDesignPath(project.id));
  }, [project.id, router, stop]);

  const goStudio = useCallback(() => {
    abortControllerRef.current?.abort();
    stop();
    router.push(buildTeacherStudioPath(project.id, { chapterId }));
  }, [project.id, chapterId, router, stop]);

  const onGateContinue = useCallback(() => {
    pendingPipelineRef.current = 'resume';
    lastPipelineKindRef.current = 'resume';
    setShowGate(false);
    setRunNonce((n) => n + 1);
  }, []);

  const onGateSoftRegenerate = useCallback(async () => {
    const sid = useStageStore.getState().stage?.id;
    if (sid) {
      await deleteStageWithRelatedData(sid);
    }
    clearTeacherPreviewBinding(project.id, chapterId);
    useStageStore.getState().clearStore();
    pendingPipelineRef.current = 'full';
    lastPipelineKindRef.current = 'full';
    setShowGate(false);
    setRunNonce((n) => n + 1);
  }, [project.id, chapterId]);

  const totalOutlines = outlines.length || streamingOutlines.length;
  const completedScenes = scenes.length;
  const progress = totalOutlines > 0 ? Math.round((completedScenes / totalOutlines) * 100) : 0;

  const vizStepId =
    phase === 'streaming-outlines'
      ? 'outline'
      : phase === 'generating-scenes'
        ? sceneVizStepId
        : phase === 'publishing' || phase === 'done'
          ? 'slide-content'
          : 'outline';

  const vizOutlines = phase === 'streaming-outlines' ? streamingOutlines : outlines;

  const titleKey =
    phase === 'streaming-outlines'
      ? 'generation.generatingOutlines'
      : phase === 'generating-scenes'
        ? sceneVizStepId === 'actions'
          ? 'generation.generatingActions'
          : 'generation.generatingSlideContent'
        : phase === 'publishing' || phase === 'done'
          ? 'teacher.preview.publishingTitle'
          : 'generation.generatingOutlines';

  const descriptionKey =
    phase === 'streaming-outlines'
      ? 'generation.generatingOutlinesDesc'
      : phase === 'generating-scenes'
        ? sceneVizStepId === 'actions'
          ? 'generation.generatingActionsDesc'
          : 'generation.generatingSlideContentDesc'
        : phase === 'publishing' || phase === 'done'
          ? 'teacher.preview.publishingDesc'
          : 'generation.generatingOutlinesDesc';

  const railLabels = [
    t('generation.generatingOutlines'),
    t('generation.generatingSlideContent'),
    t('teacher.preview.publishingTitle'),
  ];

  if (!hydrated) {
    return (
      <div className="flex min-h-[100dvh] w-full flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  if (showGate) {
    const { outlines: gateOutlines, scenes: gateScenes } = useStageStore.getState();
    const hasPublished = Boolean(project.publishedClassroomId);
    return (
      <TeacherPreviewGate
        projectTitle={project.title}
        mode={gateMode}
        draftOutlineCount={gateOutlines.length}
        draftSceneCount={gateScenes.length}
        publishedSceneCount={publishedSceneCount}
        showContinue={gateMode !== 'published-only'}
        showEnterStudio={hasPublished}
        onContinue={onGateContinue}
        onSoftRegenerate={() => {
          void onGateSoftRegenerate();
        }}
        onEnterStudio={goStudio}
        onBackToDesign={goBackToDesign}
      />
    );
  }

  return (
    <div className="relative flex min-h-[100dvh] w-full flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-slate-50 to-slate-100 px-4 py-10 text-center dark:from-slate-950 dark:to-slate-900">
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div
          className="absolute left-1/4 top-0 h-96 w-96 animate-pulse rounded-full bg-blue-500/10 blur-3xl"
          style={{ animationDuration: '4s' }}
        />
        <div
          className="absolute bottom-0 right-1/4 h-96 w-96 animate-pulse rounded-full bg-purple-500/10 blur-3xl"
          style={{ animationDuration: '6s' }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute left-4 top-4 z-20"
      >
        <Button variant="ghost" size="sm" onClick={goBackToDesign} className="gap-2">
          <ArrowLeft className="size-4" />
          {t('teacher.preview.backToDesign')}
        </Button>
      </motion.div>

      <div className="relative z-10 w-full max-w-lg space-y-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
        >
          <Card className="relative flex min-h-[420px] flex-col items-center justify-center overflow-hidden border-muted/40 bg-white/85 p-8 shadow-2xl backdrop-blur-xl dark:bg-slate-900/85 md:p-12">
            {phase !== 'error' && (
              <div className="absolute left-0 right-0 top-6 flex justify-center gap-2 px-6">
                {railLabels.map((label, idx) => (
                  <div
                    key={`rail-${idx}`}
                    className="group flex max-w-[28%] flex-1 flex-col items-center gap-1"
                    title={label}
                  >
                    <div
                      className={cn(
                        'h-1.5 rounded-full transition-all duration-500',
                        idx < railStepIndex
                          ? 'w-full max-w-[2.5rem] bg-blue-500/35'
                          : idx === railStepIndex
                            ? 'w-full max-w-[4.5rem] bg-blue-500'
                            : 'w-full max-w-[0.45rem] bg-muted/55',
                      )}
                    />
                    <span className="line-clamp-2 text-[10px] font-medium text-muted-foreground opacity-80">
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-10 flex w-full flex-1 flex-col items-center justify-center space-y-8">
              {phase === 'error' ? (
                <motion.div
                  key="error"
                  initial={{ scale: 0.92, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex size-32 items-center justify-center rounded-full border-2 border-red-500/25 bg-red-500/10"
                >
                  <AlertCircle className="size-16 text-red-500" />
                </motion.div>
              ) : phase === 'done' ? (
                <motion.div
                  key="done"
                  initial={{ scale: 0.92, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex size-32 items-center justify-center rounded-full border-2 border-green-500/25 bg-green-500/10"
                >
                  <CheckCircle2 className="size-16 text-green-500" />
                </motion.div>
              ) : (
                <div className="relative flex size-48 items-center justify-center">
                  <AnimatePresence mode="popLayout">
                    <motion.div
                      key={vizStepId + phase}
                      initial={{ scale: 0.88, opacity: 0, filter: 'blur(8px)' }}
                      animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
                      exit={{ scale: 1.08, opacity: 0, filter: 'blur(8px)' }}
                      transition={{ duration: 0.38 }}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      <StepVisualizer
                        stepId={vizStepId}
                        outlines={vizOutlines}
                        webSearchSources={[]}
                      />
                    </motion.div>
                  </AnimatePresence>
                </div>
              )}

              <div className="mx-auto max-w-sm space-y-3">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={phase + sceneVizStepId}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="space-y-2"
                  >
                    <h2 className="text-2xl font-bold tracking-tight">
                      {phase === 'error' ? t('generation.generationFailed') : t(titleKey)}
                    </h2>
                    <p className="text-base text-muted-foreground">
                      {phase === 'error'
                        ? errorMessage
                        : statusMessage ||
                          (phase === 'done'
                            ? t('teacher.preview.studioRedirectDesc')
                            : t(descriptionKey))}
                    </p>
                  </motion.div>
                </AnimatePresence>

                {phase === 'generating-scenes' && totalOutlines > 0 && (
                  <div className="space-y-2 pt-2 text-left">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>
                        {t('teacher.preview.sceneProgress', {
                          done: completedScenes,
                          total: totalOutlines,
                        })}
                      </span>
                      <span>{progress}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <motion.div
                        className="h-full rounded-full bg-primary"
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.35 }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </motion.div>

        <div className="flex h-16 items-center justify-center">
          <AnimatePresence mode="wait">
            {phase === 'error' ? (
              <motion.div
                key="err-actions"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex w-full max-w-xs flex-col gap-2"
              >
                <Button
                  size="lg"
                  variant="default"
                  className="h-12 w-full gap-2"
                  onClick={handleRetry}
                >
                  <RefreshCw className="size-4" />
                  {t('teacher.create.chat.retry')}
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 w-full"
                  onClick={goBackToDesign}
                >
                  {t('teacher.projects.backHome')}
                </Button>
              </motion.div>
            ) : phase === 'done' ? (
              <motion.p
                key="done-foot"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-sm text-muted-foreground"
              >
                {t('teacher.preview.studioRedirectTitle')}
              </motion.p>
            ) : (
              <motion.div
                key="working"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2 text-sm font-medium uppercase tracking-widest text-muted-foreground/60"
              >
                <Sparkles className="size-3 animate-pulse" />
                {t('generation.aiWorking')}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
