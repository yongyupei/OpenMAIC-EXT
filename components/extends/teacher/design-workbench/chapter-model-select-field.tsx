'use client';

import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';

import type { ProviderId } from '@/lib/ai/providers';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  buildConfiguredLlmProviders,
  ConfiguredModelPickerPopover,
} from '@components-extends/generation/configured-model-picker-popover';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSettingsStore } from '@/lib/store/settings';
import { resolveChapterGenerationModelConfig } from '@/lib/extends/teacher/resolve-chapter-model-config';
import type { GenerationProfile, GenerationProfileOverride } from '@/lib/teacher/generation-profile';
import { cn } from '@/lib/utils';

export interface ChapterModelSelectFieldProps {
  readonly generationProfileOverride?: GenerationProfileOverride;
  readonly courseGenerationProfile?: GenerationProfile;
  readonly disabled?: boolean;
  readonly onChange: (override: GenerationProfileOverride | undefined) => void;
}

export function ChapterModelSelectField({
  generationProfileOverride,
  courseGenerationProfile,
  disabled,
  onChange,
}: ChapterModelSelectFieldProps) {
  const { t } = useI18n();
  const providersConfig = useSettingsStore((state) => state.providersConfig);
  const [open, setOpen] = useState(false);

  const hasOverride = Boolean(
    generationProfileOverride?.providerId && generationProfileOverride?.modelId,
  );

  const configuredProviders = useMemo(
    () => buildConfiguredLlmProviders(providersConfig),
    [providersConfig],
  );

  const effective = resolveChapterGenerationModelConfig({
    generationProfileOverride,
    generationProfile: courseGenerationProfile,
  });
  const courseHasModel = Boolean(
    courseGenerationProfile?.providerId && courseGenerationProfile?.modelId,
  );
  const effectiveModelName = useMemo(() => {
    const provider = configuredProviders.find((entry) => entry.id === effective.providerId);
    const model = provider?.models.find((entry) => entry.id === effective.modelId);
    return model?.name ?? effective.modelId;
  }, [configuredProviders, effective.modelId, effective.providerId]);

  const handleSelect = (providerId: ProviderId, modelId: string) => {
    const providerType = providersConfig[providerId]?.type;
    onChange({
      ...(generationProfileOverride ?? {}),
      providerId,
      modelId,
      ...(providerType ? { providerType } : {}),
    });
  };

  const handleInherit = () => {
    if (!generationProfileOverride) {
      onChange(undefined);
      setOpen(false);
      return;
    }
    const next: GenerationProfileOverride = { ...generationProfileOverride };
    delete next.providerId;
    delete next.modelId;
    delete next.providerType;
    onChange(Object.keys(next).length > 0 ? next : undefined);
    setOpen(false);
  };

  const triggerLabel = hasOverride
    ? effectiveModelName
    : t('teacher.design.chapterModel.inheritCourseDefault');

  return (
    <div className="space-y-2">
      <Label className="text-xs">{t('teacher.design.chapterModel.label')}</Label>
      {configuredProviders.length === 0 ? (
        <Button
          variant="outline"
          size="sm"
          disabled
          className="h-9 w-full justify-between text-sm font-normal text-muted-foreground"
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronDown className="size-4 shrink-0 opacity-50" />
        </Button>
      ) : (
        <ConfiguredModelPickerPopover
          configuredProviders={configuredProviders}
          providerId={hasOverride ? generationProfileOverride!.providerId! : ''}
          modelId={hasOverride ? generationProfileOverride!.modelId! : ''}
          onSelect={handleSelect}
          disabled={disabled}
          side="left"
          align="start"
          open={open}
          onOpenChange={setOpen}
          providerAside={
            <button
              type="button"
              className={cn(
                'mb-1 flex h-10 w-full items-center rounded-md px-2 text-left text-xs transition-colors',
                !hasOverride
                  ? 'bg-background font-medium text-foreground shadow-sm ring-1 ring-border/70'
                  : 'text-muted-foreground hover:bg-background/70 hover:text-foreground',
              )}
              onClick={handleInherit}
            >
              {t('teacher.design.chapterModel.inheritCourseDefault')}
            </button>
          }
        >
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            className="h-9 w-full justify-between text-sm font-normal"
          >
            <span className="truncate">{triggerLabel}</span>
            <ChevronDown className="size-4 shrink-0 opacity-50" />
          </Button>
        </ConfiguredModelPickerPopover>
      )}
      <p className="text-[11px] text-muted-foreground">
        {t('teacher.design.chapterModel.effectiveHint', {
          model: effectiveModelName,
          source: hasOverride
            ? t('teacher.design.chapterModel.sourceChapter')
            : courseHasModel
              ? t('teacher.design.chapterModel.sourceCourse')
              : t('teacher.design.chapterModel.sourceGlobal'),
        })}
      </p>
    </div>
  );
}
