/**
 * @extends-from components/teacher/design-workbench/course-overview-block.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';

interface CourseOverviewBlockProps {
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly disabled?: boolean;
  readonly highlighted?: boolean;
}

export function CourseOverviewBlock({
  value,
  onChange,
  disabled,
  highlighted,
}: CourseOverviewBlockProps) {
  const { t } = useI18n();
  return (
    <div
      className={cn(
        'rounded-xl border border-slate-200/70 bg-white/90 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/80',
        highlighted &&
          'ring-2 ring-violet-400/80 ring-offset-2 ring-offset-white dark:ring-offset-slate-950',
      )}
    >
      <Label htmlFor="teacher-design-overview" className="text-sm font-medium">
        {t('teacher.create.designWorkbench.overviewLabel')}
      </Label>
      <p className="mt-1 text-xs text-muted-foreground">
        {t('teacher.create.designWorkbench.overviewHint')}
      </p>
      <Textarea
        id="teacher-design-overview"
        data-testid="teacher-design-overview"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        rows={8}
        className="mt-2 min-h-[140px] resize-y border-border/50 bg-transparent text-sm"
        placeholder={t('teacher.create.designWorkbench.overviewPlaceholder')}
      />
    </div>
  );
}
