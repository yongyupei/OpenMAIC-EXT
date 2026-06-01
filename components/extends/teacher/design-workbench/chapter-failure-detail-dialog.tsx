/**
 * @extends-from components/teacher/design-workbench/chapter-failure-detail-dialog.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';
import { CHAPTER_GENERATION_STALE_REASON } from '@/lib/teacher/chapter-classroom-status-sync';
import type { ChapterClassroomUiState } from '@/lib/teacher/chapter-classroom-ui';
import { useTraceDetailStore } from '@/lib/extends/observability/trace-detail-store';

export function ChapterFailureDetailDialog({
  open,
  onOpenChange,
  chapterTitle,
  state,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chapterTitle: string;
  state: ChapterClassroomUiState | null;
}) {
  const { t } = useI18n();

  const failedStepLabel =
    state?.failedStep === 'outline'
      ? t('teacher.chapter.failureStep.outline')
      : state?.failedStep === 'scenes'
        ? t('teacher.chapter.failureStep.scenes')
        : null;

  const failureReasonText =
    state?.failedReason === CHAPTER_GENERATION_STALE_REASON
      ? t('teacher.chapter.staleGenerationReason')
      : state?.failedReason?.trim() || t('teacher.chapter.failureReasonUnknown');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('teacher.chapter.failureDialogTitle')}</DialogTitle>
          <DialogDescription>
            {t('teacher.chapter.failureDialogDescription', { title: chapterTitle })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {failedStepLabel ? (
            <p>
              <span className="font-medium text-foreground">
                {t('teacher.chapter.failureStepLabel')}:{' '}
              </span>
              <span className="text-muted-foreground">{failedStepLabel}</span>
            </p>
          ) : null}
          {typeof state?.sceneCount === 'number' && state.sceneCount > 0 ? (
            <p className="text-muted-foreground">
              {t('teacher.chapter.failurePartialScenes', { count: state.sceneCount })}
            </p>
          ) : null}
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
            <p className="text-xs font-medium text-destructive">
              {t('teacher.chapter.failureReasonLabel')}
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">
              {failureReasonText}
            </p>
          </div>
          {state?.lastTraceId ? (
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-sm"
              data-testid="chapter-failure-open-trace"
              onClick={() => {
                onOpenChange(false);
                useTraceDetailStore
                  .getState()
                  .openTrace(state.lastTraceId!, 'failure-dialog');
              }}
            >
              {t('observability.diagnoseLink')}
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
