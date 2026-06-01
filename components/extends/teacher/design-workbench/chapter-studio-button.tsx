/**
 * @extends-from components/teacher/design-workbench/chapter-studio-button.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { ExternalLink } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';

interface ChapterStudioButtonProps {
  readonly onClick: () => void;
  readonly disabled?: boolean;
}

export function ChapterStudioButton({ onClick, disabled }: ChapterStudioButtonProps) {
  const { t } = useI18n();

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="gap-1.5"
      disabled={disabled}
      onClick={onClick}
    >
      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      {t('teacher.chapter.goToStudio')}
    </Button>
  );
}
