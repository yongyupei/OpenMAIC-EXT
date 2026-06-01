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
import { resolveCourseGenerationModelConfig } from '@/lib/extends/teacher/resolve-chapter-model-config';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSettingsStore } from '@/lib/store/settings';
import type { GenerationProfile } from '@/lib/teacher/generation-profile';
import { cn } from '@/lib/utils';

export interface CourseModelSelectFieldProps {
  readonly generationProfile?: GenerationProfile;
  readonly disabled?: boolean;
  readonly onChange: (profile: GenerationProfile | undefined) => void;
}

export function CourseModelSelectField({
  generationProfile,
  disabled,
  onChange,
}: CourseModelSelectFieldProps) {
  const { t } = useI18n();
  const providersConfig = useSettingsStore((state) => state.providersConfig);
  const [open, setOpen] = useState(false);

  const hasCourseModel = Boolean(generationProfile?.providerId && generationProfile?.modelId);

  const configuredProviders = useMemo(
    () => buildConfiguredLlmProviders(providersConfig),
    [providersConfig],
  );

  const effective = resolveCourseGenerationModelConfig({ generationProfile });
  const effectiveModelName = useMemo(() => {
    const provider = configuredProviders.find((entry) => entry.id === effective.providerId);
    const model = provider?.models.find((entry) => entry.id === effective.modelId);
    return model?.name ?? effective.modelId;
  }, [configuredProviders, effective.modelId, effective.providerId]);

  const handleSelect = (providerId: ProviderId, modelId: string) => {
    const providerType = providersConfig[providerId]?.type;
    onChange({
      workflowPresetId: generationProfile?.workflowPresetId ?? 'default-course-generation',
      ...(generationProfile ?? {}),
      providerId,
      modelId,
      ...(providerType ? { providerType } : {}),
    });
  };

  const handleInheritGlobal = () => {
    if (!generationProfile) {
      onChange(undefined);
      setOpen(false);
      return;
    }
    const next: GenerationProfile = {
      ...generationProfile,
      workflowPresetId: generationProfile.workflowPresetId ?? 'default-course-generation',
    };
    delete next.providerId;
    delete next.modelId;
    delete next.providerType;
    onChange(next);
    setOpen(false);
  };

  const triggerLabel = hasCourseModel
    ? effectiveModelName
    : t('teacher.design.courseModel.inheritGlobal');

  return (
    <div className="space-y-2">
      <Label className="text-xs">{t('teacher.design.courseModel.label')}</Label>
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
          providerId={hasCourseModel ? generationProfile!.providerId! : ''}
          modelId={hasCourseModel ? generationProfile!.modelId! : ''}
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
                !hasCourseModel
                  ? 'bg-background font-medium text-foreground shadow-sm ring-1 ring-border/70'
                  : 'text-muted-foreground hover:bg-background/70 hover:text-foreground',
              )}
              onClick={handleInheritGlobal}
            >
              {t('teacher.design.courseModel.inheritGlobal')}
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
        {t('teacher.design.courseModel.effectiveHint', {
          model: effectiveModelName,
          source: hasCourseModel
            ? t('teacher.design.courseModel.sourceCourse')
            : t('teacher.design.courseModel.sourceGlobal'),
        })}
      </p>
    </div>
  );
}
