/**
 * @extends-from components/teacher/design-workbench/persistence-status-indicator.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { Check, Loader2, AlertCircle } from 'lucide-react';

import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';

export type PersistenceUiStatus = 'idle' | 'saving' | 'saved' | 'error';

interface PersistenceStatusIndicatorProps {
  readonly status: PersistenceUiStatus;
}

export function PersistenceStatusIndicator({ status }: PersistenceStatusIndicatorProps) {
  const { t } = useI18n();
  if (status === 'idle') return null;

  const icon =
    status === 'saving' ? (
      <Loader2 className="size-3.5 animate-spin text-violet-600 dark:text-violet-300" />
    ) : status === 'saved' ? (
      <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
    ) : (
      <AlertCircle className="size-3.5 text-destructive" />
    );

  const message =
    status === 'saving'
      ? t('teacher.create.designWorkbench.persistenceSaving')
      : status === 'saved'
        ? t('teacher.create.designWorkbench.persistenceSaved')
        : t('teacher.create.designWorkbench.persistenceError');

  return (
    <div
      data-testid="teacher-design-persistence-status"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium',
        status === 'saving' &&
          'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900 dark:bg-violet-950/50 dark:text-violet-200',
        status === 'saved' &&
          'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
        status === 'error' &&
          'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200',
      )}
    >
      {icon}
      <span>{message}</span>
    </div>
  );
}
