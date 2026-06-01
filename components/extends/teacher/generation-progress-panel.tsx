/**
 * @extends-from components/teacher/generation-progress-panel.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';
import type { ChapterStepStatus } from '@/lib/teacher/generation-scheduler';
import type { GenerationChapterRow } from '@/components/teacher/design-workbench/generation-progress-dialog';

interface GenerationProgressPanelProps {
  readonly chapters: readonly GenerationChapterRow[];
  readonly publishPhase?: boolean;
  readonly errorMessage?: string | null;
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

export function GenerationProgressPanel({
  chapters,
  publishPhase,
  errorMessage,
  onRetry,
}: GenerationProgressPanelProps) {
  const { t } = useI18n();

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {t('teacher.create.designWorkbench.generationDialogTitle')}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('teacher.create.designWorkbench.generationDialogDescription')}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <ul className="space-y-2">
          {chapters.map((row) => (
            <li
              key={row.id}
              data-testid={`teacher-generate-progress-chapter-${row.id}`}
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
          <div className="mt-4 space-y-2">
            <p
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              role="alert"
            >
              {errorMessage}
            </p>
            {onRetry ? (
              <Button type="button" size="sm" variant="secondary" onClick={onRetry}>
                {t('teacher.create.designWorkbench.generationRetry')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
