'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { GenerationMode } from '@/lib/slide-templates/types';
import type { GenerationProfile, GenerationProfileOverride } from '@/lib/teacher/generation-profile';
import { ChapterGenerationSettingsPane } from './chapter-generation-settings-pane';

export function ChapterGenerationSettingsDrawer({
  chapterTitle,
  projectId,
  open,
  onOpenChange,
  slideTemplateId,
  generationMode,
  generationProfileOverride,
  courseSlideTemplateId,
  courseGenerationMode,
  courseGenerationProfile,
  onSlideTemplateChange,
  onGenerationModeChange,
  onGenerationProfileOverrideChange,
  disabled,
}: {
  readonly chapterTitle?: string;
  readonly projectId?: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly slideTemplateId?: string;
  readonly generationMode?: GenerationMode;
  readonly generationProfileOverride?: GenerationProfileOverride;
  readonly courseSlideTemplateId?: string;
  readonly courseGenerationMode?: GenerationMode;
  readonly courseGenerationProfile?: GenerationProfile;
  readonly onSlideTemplateChange: (templateId: string | undefined) => void;
  readonly onGenerationModeChange: (mode: GenerationMode | undefined) => void;
  readonly onGenerationProfileOverrideChange: (
    override: GenerationProfileOverride | undefined,
  ) => void;
  readonly disabled?: boolean;
}) {
  const { t } = useI18n();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="fixed inset-y-0 right-0 left-auto top-0 flex h-full max-h-full w-full max-w-lg translate-x-0 translate-y-0 flex-col gap-4 rounded-none rounded-l-xl p-4 sm:max-w-lg"
        data-testid="chapter-generation-settings-drawer"
      >
        <DialogHeader>
          <DialogTitle>
            {chapterTitle
              ? t('teacher.design.chapterGeneration.drawerTitleWithChapter', {
                  title: chapterTitle,
                })
              : t('teacher.design.chapterGeneration.title')}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {t('teacher.design.chapterGeneration.hint')}
          </p>
        </DialogHeader>
        <ChapterGenerationSettingsPane
          projectId={projectId}
          slideTemplateId={slideTemplateId}
          generationMode={generationMode}
          generationProfileOverride={generationProfileOverride}
          courseSlideTemplateId={courseSlideTemplateId}
          courseGenerationMode={courseGenerationMode}
          courseGenerationProfile={courseGenerationProfile}
          onSlideTemplateChange={onSlideTemplateChange}
          onGenerationModeChange={onGenerationModeChange}
          onGenerationProfileOverrideChange={onGenerationProfileOverrideChange}
          disabled={disabled}
          className="min-h-0 flex-1 overflow-y-auto"
        />
      </DialogContent>
    </Dialog>
  );
}
