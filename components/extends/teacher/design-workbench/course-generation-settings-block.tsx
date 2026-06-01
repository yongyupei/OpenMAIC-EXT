/**
 * @extends-from components/teacher/design-workbench/course-generation-settings-block.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { CourseGenerationSettingsPane } from './course-generation-settings-pane';
import type { CourseGenerationSettingsPaneProps } from './course-generation-settings-pane';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/hooks/use-i18n';

export type CourseGenerationSettingsBlockProps = CourseGenerationSettingsPaneProps & {
  readonly highlighted?: boolean;
  readonly className?: string;
};

/** Inline card wrapper — prefer {@link CourseGenerationSettingsDrawer} in the design workbench. */
export function CourseGenerationSettingsBlock({
  highlighted,
  className,
  ...paneProps
}: CourseGenerationSettingsBlockProps) {
  const { t } = useI18n();

  return (
    <div
      className={cn(
        'flex h-full min-w-0 flex-col rounded-xl border border-slate-200/70 bg-white/90 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/80',
        highlighted &&
          'ring-2 ring-violet-400/80 ring-offset-2 ring-offset-white dark:ring-offset-slate-950',
        className,
      )}
    >
      <h3 className="text-sm font-medium">{t('teacher.design.generationSettings.title')}</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {t('teacher.design.generationSettings.hint')}
      </p>
      <CourseGenerationSettingsPane {...paneProps} className="mt-2" />
    </div>
  );
}
