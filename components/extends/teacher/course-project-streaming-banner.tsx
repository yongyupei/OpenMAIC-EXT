/**
 * @extends-from components/teacher/course-project-streaming-banner.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { Sparkles, Square } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';

interface CourseProjectStreamingBannerProps {
  readonly visible: boolean;
  readonly onCancel: () => void;
}

export function CourseProjectStreamingBanner({
  visible,
  onCancel,
}: CourseProjectStreamingBannerProps) {
  const { t } = useI18n();

  if (!visible) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="overflow-hidden"
    >
      <div className="flex items-center gap-3 rounded-2xl border border-violet-300/70 bg-gradient-to-r from-violet-100/90 via-violet-50/80 to-purple-100/80 px-4 py-3 shadow-md shadow-violet-100/50 backdrop-blur dark:border-violet-700/60 dark:from-violet-950/60 dark:via-slate-900/60 dark:to-purple-950/60 dark:shadow-violet-900/30">
        <span className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-violet-600 dark:text-violet-200">
          <span className="absolute inset-0 animate-ping rounded-full bg-violet-500/20" />
          <Sparkles className="relative size-4" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="text-sm font-semibold text-violet-900 dark:text-violet-100">
            {t('teacher.create.streamingBanner.title')}
          </p>
          <p className="truncate text-xs text-violet-800/80 dark:text-violet-200/80">
            {t('teacher.create.streamingBanner.description')}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0 border-violet-300 bg-white/70 text-violet-700 hover:bg-white dark:border-violet-700 dark:bg-slate-900/60 dark:text-violet-100"
          onClick={onCancel}
        >
          <Square className="size-3.5" />
          <span className="ml-1">{t('teacher.create.chat.stop')}</span>
        </Button>
      </div>
    </div>
  );
}
