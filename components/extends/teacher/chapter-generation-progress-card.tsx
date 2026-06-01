'use client';

import Link from 'next/link';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

import { StepVisualizer } from '@/app/generation-preview/components/visualizers';
import { OutlinesEditor } from '@/components/generation/outlines-editor';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSettingsStore } from '@/lib/store/settings';
import type { ChapterGenerationPhase } from '@/lib/teacher/chapter-generation-flow';
import type { CourseChapterClassroomGenerationStep } from '@/lib/teacher/course-types';
import type { SceneOutline } from '@/lib/types/generation';
import { cn } from '@/lib/utils';
import { useTraceDetailStore } from '@/lib/extends/observability/trace-detail-store';

export interface ChapterGenerationProgressCardProps {
  readonly phase: ChapterGenerationPhase;
  readonly activeStepType?: CourseChapterClassroomGenerationStep;
  readonly chapterTitle: string;
  readonly chapterOrder: number;
  readonly errorMessage: string | null;
  readonly sceneCount?: number;
  readonly totalScenes?: number;
  readonly statusMessage?: string;
  readonly resumeGeneration?: boolean;
  readonly backHref: string;
  readonly studioHref: string;
  readonly showStudioButton?: boolean;
  /** Scene outlines surfaced while awaiting approval (editable in OutlinesEditor). */
  readonly pendingOutlines?: readonly SceneOutline[];
  /** Notified when the user edits outlines in the review editor. */
  readonly onPendingOutlinesChange?: (outlines: SceneOutline[]) => void;
  /** Approve handler is invoked from the editor's confirm button; outline list is read from `pendingOutlines`. */
  readonly approvingOutline?: boolean;
  readonly onBack: () => void;
  readonly onRetry?: () => void;
  readonly onApproveOutline?: () => void;
  /** Latest AI trace id from chapter classroom (for failed-state diagnosis). */
  readonly lastTraceId?: string;
}

function mapVisualizerStepId(
  phase: ChapterGenerationPhase,
  activeStepType?: CourseChapterClassroomGenerationStep,
): string {
  if (phase === 'outlining' || activeStepType === 'outline') return 'outline';
  if (activeStepType === 'scene-actions') return 'actions';
  if (phase === 'generating' || activeStepType === 'scene-content') return 'slide-content';
  if (activeStepType === 'media' || activeStepType === 'persist') return 'slide-content';
  return 'outline';
}

function mapRailStepIndex(
  phase: ChapterGenerationPhase,
  activeStepType?: CourseChapterClassroomGenerationStep,
): number {
  if (phase === 'ready') return 2;
  if (phase === 'outlining' || phase === 'awaiting-approval' || activeStepType === 'outline') {
    return 0;
  }
  if (phase === 'generating') return 1;
  if (phase === 'failed') {
    return activeStepType === 'scene-content' ||
      activeStepType === 'scene-actions' ||
      activeStepType === 'media' ||
      activeStepType === 'persist'
      ? 1
      : 0;
  }
  return 0;
}

function resolveTitleKey(
  phase: ChapterGenerationPhase,
  activeStepType?: CourseChapterClassroomGenerationStep,
): string {
  if (phase === 'awaiting-approval') {
    return 'teacher.create.designWorkbench.flowStep.awaitingApproval';
  }
  if (phase === 'ready') {
    return 'generation.generationComplete';
  }
  if (phase === 'outlining' || activeStepType === 'outline') {
    return 'generation.generatingOutlines';
  }
  if (activeStepType === 'scene-actions') {
    return 'generation.generatingActions';
  }
  if (phase === 'generating') {
    return 'generation.generatingSlideContent';
  }
  return 'generation.generatingOutlines';
}

function resolveDescriptionKey(
  phase: ChapterGenerationPhase,
  activeStepType?: CourseChapterClassroomGenerationStep,
): string {
  if (phase === 'awaiting-approval') {
    return 'generation.reviewOutlineDesc';
  }
  if (phase === 'ready') {
    return 'teacher.preview.studioRedirectDesc';
  }
  if (phase === 'outlining' || activeStepType === 'outline') {
    return 'generation.generatingOutlinesDesc';
  }
  if (activeStepType === 'scene-actions') {
    return 'generation.generatingActionsDesc';
  }
  if (phase === 'generating') {
    return 'generation.generatingSlideContentDesc';
  }
  return 'generation.generatingOutlinesDesc';
}

function resolveCurrentSceneDisplayIndex(
  phase: ChapterGenerationPhase,
  sceneCount: number,
  totalScenes?: number,
): number {
  if (phase === 'ready') {
    return Math.max(1, sceneCount);
  }
  if (phase === 'outlining' || phase === 'awaiting-approval') {
    return 1;
  }
  if (phase === 'generating') {
    const nextScene = sceneCount + 1;
    if (totalScenes != null && totalScenes > 0) {
      return Math.min(nextScene, totalScenes);
    }
    return Math.max(1, nextScene);
  }
  return Math.max(1, sceneCount || 1);
}

/** Lifts the outline approval state into a dedicated full-page review screen
 * (matching the `/generation-preview` student flow) and delegates editing to
 * the shared OutlinesEditor. */
function ChapterOutlineReviewScreen({
  chapterTitle,
  outlines,
  onChange,
  onConfirm,
  onBack,
  isConfirming,
}: {
  readonly chapterTitle: string;
  readonly outlines: readonly SceneOutline[];
  readonly onChange: (outlines: SceneOutline[]) => void;
  readonly onConfirm: () => void;
  readonly onBack: () => void;
  readonly isConfirming: boolean;
}) {
  const { t } = useI18n();
  const reviewOutlineEnabled = useSettingsStore((state) => state.reviewOutlineEnabled);
  const setReviewOutlineEnabled = useSettingsStore((state) => state.setReviewOutlineEnabled);
  return (
    <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute left-4 top-4 z-20"
      >
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
          <ArrowLeft className="size-4" />
          {t('teacher.chapterStudio.backToDesign')}
        </Button>
      </motion.div>

      <div className="flex min-h-0 flex-1 flex-col items-center overflow-hidden px-4 pb-4 pt-14">
        <div className="flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-3 overflow-hidden">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="shrink-0 space-y-1 text-center"
          >
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {chapterTitle}
            </p>
            <h2 className="text-xl font-bold tracking-tight md:text-2xl">
              {t('generation.reviewOutlineTitle')}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t('generation.reviewOutlineDesc')}
            </p>
          </motion.div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <OutlinesEditor
              embeddedLayout
              outlines={outlines as SceneOutline[]}
              onChange={onChange}
              onConfirm={onConfirm}
              onBack={onBack}
              isLoading={isConfirming}
              alwaysReview={reviewOutlineEnabled}
              onAlwaysReviewChange={setReviewOutlineEnabled}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ChapterGenerationProgressCard({
  phase,
  activeStepType,
  chapterTitle,
  errorMessage,
  sceneCount = 0,
  totalScenes,
  statusMessage,
  resumeGeneration = false,
  backHref,
  studioHref,
  showStudioButton = false,
  pendingOutlines,
  onPendingOutlinesChange,
  approvingOutline = false,
  onBack,
  onRetry,
  onApproveOutline,
  lastTraceId,
}: ChapterGenerationProgressCardProps) {
  const { t } = useI18n();

  const isError = phase === 'failed';
  const isDone = phase === 'ready';
  const isAwaitingApproval = phase === 'awaiting-approval';
  const isWorking = !isError && !isDone && !isAwaitingApproval;
  const outlines = pendingOutlines ?? [];

  // When the user has editable outlines, swap to the full OutlinesEditor review
  // screen (identical UX to /generation-preview's outline confirmation step).
  if (
    isAwaitingApproval &&
    outlines.length > 0 &&
    typeof onPendingOutlinesChange === 'function' &&
    typeof onApproveOutline === 'function'
  ) {
    return (
      <ChapterOutlineReviewScreen
        chapterTitle={chapterTitle}
        outlines={outlines}
        onChange={onPendingOutlinesChange}
        onConfirm={onApproveOutline}
        onBack={onBack}
        isConfirming={approvingOutline}
      />
    );
  }

  const vizStepId = mapVisualizerStepId(phase, activeStepType);
  const railStepIndex = mapRailStepIndex(phase, activeStepType);
  const progress =
    totalScenes && totalScenes > 0 ? Math.round((sceneCount / totalScenes) * 100) : 0;
  const sceneDisplayIndex = resolveCurrentSceneDisplayIndex(phase, sceneCount, totalScenes);

  const railLabels = [
    t('generation.generatingOutlines'),
    t('generation.generatingSlideContent'),
    t('generation.generationComplete'),
  ];

  const titleKey = resolveTitleKey(phase, activeStepType);
  const descriptionKey = resolveDescriptionKey(phase, activeStepType);

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
        className="absolute right-4 top-4 z-20"
      >
        {showStudioButton ? (
          <Button variant="default" size="sm" asChild className="gap-2">
            <Link href={studioHref}>
              {t('teacher.chapter.goToStudio')}
            </Link>
          </Button>
        ) : null}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute left-4 top-4 z-20"
      >
        <Button variant="ghost" size="sm" asChild className="gap-2">
          <Link href={backHref}>
            <ArrowLeft className="size-4" />
            {t('teacher.chapterStudio.backToDesign')}
          </Link>
        </Button>
      </motion.div>

      <div className="relative z-10 w-full max-w-lg space-y-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
        >
          <Card className="relative flex min-h-[420px] flex-col items-center justify-center overflow-hidden border-muted/40 bg-white/85 p-8 shadow-2xl backdrop-blur-xl dark:bg-slate-900/85 md:p-12">
            {!isError && (
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

            <div className="mt-8 flex w-full flex-1 flex-col items-center justify-center space-y-6">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t('teacher.chapterStudio.sceneLabel', { order: String(sceneDisplayIndex) })}
              </p>
              <p className="-mt-4 max-w-sm truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                {chapterTitle}
              </p>

              {isError ? (
                <motion.div
                  key="error"
                  initial={{ scale: 0.92, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex size-32 items-center justify-center rounded-full border-2 border-red-500/25 bg-red-500/10"
                >
                  <AlertCircle className="size-16 text-red-500" />
                </motion.div>
              ) : isDone ? (
                <motion.div
                  key="done"
                  initial={{ scale: 0.92, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex size-32 items-center justify-center rounded-full border-2 border-green-500/25 bg-green-500/10"
                >
                  <CheckCircle2 className="size-16 text-green-500" />
                </motion.div>
              ) : isAwaitingApproval ? (
                <div className="relative flex size-48 items-center justify-center">
                  <StepVisualizer stepId="outline" outlines={[]} />
                </div>
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
                      <StepVisualizer stepId={vizStepId} outlines={[]} />
                    </motion.div>
                  </AnimatePresence>
                </div>
              )}

              <div className="mx-auto max-w-sm space-y-3">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={phase + (activeStepType ?? '')}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="space-y-2"
                  >
                    <h2 className="text-2xl font-bold tracking-tight">
                      {isError ? t('generation.generationFailed') : t(titleKey)}
                    </h2>
                    <p className="text-base text-muted-foreground">
                      {isError
                        ? errorMessage
                        : statusMessage || t(descriptionKey, { defaultValue: descriptionKey })}
                    </p>
                  </motion.div>
                </AnimatePresence>

                {phase === 'generating' && totalScenes != null && totalScenes > 0 && (
                  <div className="space-y-2 pt-2 text-left">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>
                        {t('teacher.preview.sceneProgress', {
                          done: sceneCount,
                          total: totalScenes,
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

                {isAwaitingApproval && onApproveOutline && (
                  <Button type="button" className="mt-2 w-full" onClick={onApproveOutline}>
                    {t('teacher.chapter.approveOutlineContinue')}
                  </Button>
                )}
              </div>
            </div>
          </Card>
        </motion.div>

        <div className="flex h-16 items-center justify-center">
          <AnimatePresence mode="wait">
            {isError && onRetry ? (
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
                  onClick={onRetry}
                >
                  <RefreshCw className="size-4" />
                  {resumeGeneration
                    ? t('teacher.chapter.retryContinue')
                    : t('teacher.create.chat.retry')}
                </Button>
                {lastTraceId ? (
                  <Button
                    type="button"
                    size="lg"
                    variant="outline"
                    className="h-12 w-full"
                    data-testid="chapter-progress-diagnose"
                    onClick={() =>
                      useTraceDetailStore.getState().openTrace(lastTraceId, 'progress-card')
                    }
                  >
                    {t('observability.diagnoseButton')}
                  </Button>
                ) : null}
                <Button size="lg" variant="outline" className="h-12 w-full" onClick={onBack}>
                  {t('teacher.projects.backHome')}
                </Button>
              </motion.div>
            ) : isDone ? (
              <motion.p
                key="done-foot"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-sm text-muted-foreground"
              >
                {t('teacher.preview.studioRedirectTitle')}
              </motion.p>
            ) : isWorking ? (
              <motion.div
                key="working"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2 text-sm font-medium uppercase tracking-widest text-muted-foreground/60"
              >
                <Sparkles className="size-3 animate-pulse" />
                {t('generation.aiWorking')}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
