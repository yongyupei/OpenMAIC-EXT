/**
 * @extends-from components/teacher/teacher-run-status-panel.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { useI18n } from '@/lib/hooks/use-i18n';
import type { TeacherRunStatus } from '@/lib/teacher/course-types';

export function clampRunProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.min(100, Math.max(0, progress));
}

export function getTeacherRunStepTranslationKey(step: TeacherRunStatus['step']): string {
  switch (step) {
    case 'idle':
      return 'teacher.studio.steps.idle';
    case 'outline':
      return 'teacher.studio.steps.outline';
    case 'chapter-content':
      return 'teacher.studio.steps.chapterContent';
    case 'chapter-actions':
      return 'teacher.studio.steps.chapterActions';
    case 'publish':
      return 'teacher.studio.steps.publish';
    default: {
      const exhaustiveCheck: never = step;
      return exhaustiveCheck;
    }
  }
}

export function TeacherRunStatusPanel({ run }: { readonly run?: TeacherRunStatus }) {
  const { t } = useI18n();

  if (!run) return null;

  const progress = clampRunProgress(run.progress);

  return (
    <aside
      className="w-80 shrink-0 border-l bg-background p-4"
      aria-label={t('teacher.studio.statusPanel')}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t('teacher.studio.runStatusTitle')}
      </p>
      <p className="mt-2 text-sm font-medium">{t(getTeacherRunStepTranslationKey(run.step))}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {run.message || t('teacher.studio.runStatusNoMessage')}
      </p>
      <div
        className="mt-3 h-2 rounded bg-muted"
        role="progressbar"
        aria-label={t('teacher.studio.progressLabel')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        <div className="h-2 rounded bg-primary" style={{ width: `${progress}%` }} />
      </div>
    </aside>
  );
}
