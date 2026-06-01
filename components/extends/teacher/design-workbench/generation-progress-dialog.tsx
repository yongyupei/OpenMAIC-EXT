/**
 * @extends-from components/teacher/design-workbench/generation-progress-dialog.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { Loader2, CheckCircle2, XCircle, Circle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';
import type { ChapterStepStatus } from '@/lib/teacher/generation-scheduler';

export interface GenerationChapterRow {
  readonly id: string;
  readonly title: string;
  readonly status: ChapterStepStatus;
}

interface GenerationProgressDialogProps {
  readonly open: boolean;
  readonly chapters: readonly GenerationChapterRow[];
  readonly publishPhase?: boolean;
  readonly errorMessage?: string | null;
  readonly onClose: () => void;
  readonly onRetry?: () => void;
}

function statusIcon(status: ChapterStepStatus) {
  switch (status) {
    case 'pending':
      return <Circle className="size-4 text-muted-foreground" />;
    case 'outlining':
    case 'generating':
      return <Loader2 className="size-4 animate-spin text-violet-600 dark:text-violet-300" />;
    case 'ready':
      return <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />;
    case 'failed':
      return <XCircle className="size-4 text-destructive" />;
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

export function GenerationProgressDialog({
  open,
  chapters,
  publishPhase,
  errorMessage,
  onClose,
  onRetry,
}: GenerationProgressDialogProps) {
  const { t } = useI18n();
  const busy =
    chapters.some((row) => row.status === 'outlining' || row.status === 'generating') ||
    publishPhase;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent data-testid="teacher-design-generation-dialog" className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('teacher.create.designWorkbench.generationDialogTitle')}</DialogTitle>
          <DialogDescription>
            {t('teacher.create.designWorkbench.generationDialogDescription')}
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-[320px] space-y-2 overflow-y-auto py-2">
          {chapters.map((row) => (
            <li
              key={row.id}
              data-testid={`teacher-design-generation-chapter-${row.id}`}
              className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-sm"
            >
              <span className="shrink-0">{statusIcon(row.status)}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{row.title}</span>
              <span
                className={cn(
                  'shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground',
                  row.status === 'failed' && 'text-destructive',
                )}
              >
                {t(`teacher.create.designWorkbench.chapterStep.${row.status}`)}
              </span>
            </li>
          ))}
          {publishPhase ? (
            <li className="flex items-center gap-2 rounded-md border border-violet-200/70 bg-violet-50/50 px-3 py-2 text-sm dark:border-violet-900 dark:bg-violet-950/30">
              <Loader2 className="size-4 shrink-0 animate-spin text-violet-600" />
              <span className="font-medium">{t('teacher.create.designWorkbench.publishing')}</span>
            </li>
          ) : null}
        </ul>
        {errorMessage ? (
          <p
            data-testid="teacher-design-generation-error"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            role="alert"
          >
            {errorMessage}
          </p>
        ) : null}
        <DialogFooter className="gap-2 sm:justify-between">
          {errorMessage && onRetry ? (
            <Button
              type="button"
              variant="secondary"
              onClick={onRetry}
              data-testid="teacher-design-generation-retry"
            >
              {t('teacher.create.designWorkbench.generationRetry')}
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            {busy
              ? t('teacher.create.designWorkbench.generationCloseDisabled')
              : t('common.cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
