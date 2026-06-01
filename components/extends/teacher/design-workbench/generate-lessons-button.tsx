/**
 * @extends-from components/teacher/design-workbench/generate-lessons-button.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { Loader2, Wand2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';

interface GenerateLessonsButtonProps {
  readonly disabled: boolean;
  readonly loading: boolean;
  readonly onClick: () => void;
  readonly size?: 'default' | 'sm' | 'lg';
  readonly className?: string;
  readonly testId?: string;
}

export function GenerateLessonsButton({
  disabled,
  loading,
  onClick,
  size = 'lg',
  className,
  testId = 'teacher-design-generate-lessons',
}: GenerateLessonsButtonProps) {
  const { t } = useI18n();
  return (
    <Button
      type="button"
      data-testid={testId}
      size={size}
      className={cn('gap-2', className)}
      disabled={disabled || loading}
      onClick={onClick}
    >
      {loading ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          {t('teacher.create.designWorkbench.generateLoading')}
        </>
      ) : (
        <>
          <Wand2 className="size-4" />
          {t('teacher.create.designWorkbench.generateButton')}
        </>
      )}
    </Button>
  );
}
