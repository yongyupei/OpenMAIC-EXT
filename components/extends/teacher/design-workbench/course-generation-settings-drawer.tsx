'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { GenerationMode } from '@/lib/slide-templates/types';
import type { SlideOutputFormat } from '@/lib/teacher/slide-output-format';
import type { GenerationProfile } from '@/lib/teacher/generation-profile';
import { CourseGenerationSettingsPane } from './course-generation-settings-pane';

export function CourseGenerationSettingsDrawer({
  projectId,
  open,
  onOpenChange,
  slideTemplateId,
  generationMode,
  slideOutputFormat = 'canvas',
  generationProfile,
  onUpdated,
  disabled,
}: {
  readonly projectId: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly slideTemplateId?: string;
  readonly generationMode?: GenerationMode;
  readonly slideOutputFormat?: SlideOutputFormat;
  readonly generationProfile?: GenerationProfile;
  readonly onUpdated: (patch: {
    slideTemplateId?: string;
    generationMode?: GenerationMode;
    slideOutputFormat?: SlideOutputFormat;
    generationProfile?: GenerationProfile;
  }) => void;
  readonly disabled?: boolean;
}) {
  const { t } = useI18n();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="fixed inset-y-0 right-0 left-auto top-0 flex h-full max-h-full w-full max-w-lg translate-x-0 translate-y-0 flex-col gap-4 rounded-none rounded-l-xl p-4 sm:max-w-lg"
        data-testid="course-generation-settings-drawer"
      >
        <DialogHeader>
          <DialogTitle>{t('teacher.design.generationSettings.title')}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {t('teacher.design.generationSettings.hint')}
          </p>
        </DialogHeader>
        <CourseGenerationSettingsPane
          projectId={projectId}
          slideTemplateId={slideTemplateId}
          generationMode={generationMode}
          slideOutputFormat={slideOutputFormat}
          generationProfile={generationProfile}
          onUpdated={onUpdated}
          disabled={disabled}
          className="min-h-0 flex-1 overflow-y-auto"
        />
      </DialogContent>
    </Dialog>
  );
}
