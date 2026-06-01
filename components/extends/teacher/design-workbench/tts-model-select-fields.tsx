'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  ConfiguredModelPickerPopover,
  type ConfiguredLlmProvider,
} from '@components-extends/generation/configured-model-picker-popover';
import { listSelectableTtsProviders } from '@/lib/extends/generation/configured-tts-providers';
import {
  formatGenerationTtsLabel,
  resolveGenerationTtsConfig,
} from '@/lib/extends/teacher/resolve-generation-tts-config';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSettingsStore } from '@/lib/store/settings';
import type {
  GenerationProfile,
  GenerationProfileOverride,
} from '@/lib/teacher/generation-profile';
import type { ProviderId } from '@/lib/ai/providers';
import type { TTSProviderId } from '@/lib/audio/types';
import { cn } from '@/lib/utils';

type TtsSelectScope =
  | {
      readonly scope: 'course';
      readonly generationProfile?: GenerationProfile;
      readonly onChange: (profile: GenerationProfile | undefined) => void;
    }
  | {
      readonly scope: 'chapter';
      readonly generationProfileOverride?: GenerationProfileOverride;
      readonly courseGenerationProfile?: GenerationProfile;
      readonly onChange: (override: GenerationProfileOverride | undefined) => void;
    };

export function TtsModelSelectFields(props: TtsSelectScope & { readonly disabled?: boolean }) {
  const { t } = useI18n();
  const ttsProvidersConfig = useSettingsStore((state) => state.ttsProvidersConfig);
  const [open, setOpen] = useState(false);
  const [providersReady, setProvidersReady] = useState(false);

  useEffect(() => {
    void useSettingsStore.getState().fetchServerProviders().finally(() => setProvidersReady(true));
  }, []);

  const providers = useMemo(
    () => listSelectableTtsProviders(ttsProvidersConfig),
    [ttsProvidersConfig],
  );

  const configuredProviders = useMemo<ConfiguredLlmProvider[]>(
    () =>
      providers.map((provider) => ({
        id: provider.id as ProviderId,
        name: provider.name,
        models: provider.models.map((model) => ({ id: model.id, name: model.name })),
      })),
    [providers],
  );

  const inheritLabel =
    props.scope === 'course'
      ? t('teacher.design.courseTtsModel.inheritGlobal')
      : t('teacher.design.chapterTtsModel.inheritCourseDefault');

  const label =
    props.scope === 'course'
      ? t('teacher.design.courseTtsModel.label')
      : t('teacher.design.chapterTtsModel.label');

  const hasExplicitOverride =
    props.scope === 'course'
      ? Boolean(props.generationProfile?.ttsProviderId)
      : Boolean(props.generationProfileOverride?.ttsProviderId);

  const effective = resolveGenerationTtsConfig(
    props.scope === 'course'
      ? { generationProfile: props.generationProfile }
      : {
          generationProfile: props.courseGenerationProfile,
          generationProfileOverride: props.generationProfileOverride,
        },
  );

  const effectiveLabel = effective
    ? formatGenerationTtsLabel(effective, providers)
    : t('teacher.design.courseTtsModel.notConfigured');

  const explicitProviderId =
    props.scope === 'course'
      ? props.generationProfile?.ttsProviderId
      : props.generationProfileOverride?.ttsProviderId;

  const explicitModelId =
    props.scope === 'course'
      ? props.generationProfile?.ttsModelId
      : props.generationProfileOverride?.ttsModelId;

  const applyCourse = (patch: Partial<GenerationProfile>) => {
    if (props.scope !== 'course') return;
    props.onChange({
      workflowPresetId: props.generationProfile?.workflowPresetId ?? 'default-course-generation',
      ...(props.generationProfile ?? {}),
      ...patch,
    });
  };

  const applyChapter = (patch: Partial<GenerationProfileOverride>) => {
    if (props.scope !== 'chapter') return;
    props.onChange({
      ...(props.generationProfileOverride ?? {}),
      ...patch,
    });
  };

  const handleInherit = () => {
    if (props.scope === 'course') {
      if (!props.generationProfile) {
        props.onChange(undefined);
        setOpen(false);
        return;
      }
      const next: GenerationProfile = {
        ...props.generationProfile,
        workflowPresetId: props.generationProfile.workflowPresetId ?? 'default-course-generation',
      };
      delete next.ttsProviderId;
      delete next.ttsModelId;
      props.onChange(next);
      setOpen(false);
      return;
    }

    if (!props.generationProfileOverride) {
      props.onChange(undefined);
      setOpen(false);
      return;
    }
    const next: GenerationProfileOverride = { ...props.generationProfileOverride };
    delete next.ttsProviderId;
    delete next.ttsModelId;
    props.onChange(Object.keys(next).length > 0 ? next : undefined);
    setOpen(false);
  };

  const handleSelect = (providerId: string, modelId: string) => {
    if (props.scope === 'course') {
      applyCourse({ ttsProviderId: providerId, ttsModelId: modelId });
    } else {
      applyChapter({ ttsProviderId: providerId, ttsModelId: modelId });
    }
    setOpen(false);
  };

  const triggerLabel = !providersReady
    ? t('common.loading')
    : configuredProviders.length === 0
      ? t('teacher.design.courseTtsModel.noProvidersHint')
      : hasExplicitOverride
        ? formatGenerationTtsLabel(
            {
              providerId: explicitProviderId as TTSProviderId,
              modelId: explicitModelId ?? effective?.modelId ?? '',
              source: props.scope === 'course' ? 'course' : 'chapter',
            },
            providers,
          )
        : inheritLabel;

  const sourceLabel =
    props.scope === 'course'
      ? hasExplicitOverride
        ? t('teacher.design.courseTtsModel.sourceCourse')
        : t('teacher.design.courseTtsModel.sourceGlobal')
      : hasExplicitOverride
        ? t('teacher.design.chapterTtsModel.sourceChapter')
        : props.courseGenerationProfile?.ttsProviderId
          ? t('teacher.design.chapterTtsModel.sourceCourse')
          : t('teacher.design.chapterTtsModel.sourceGlobal');

  const hintKey =
    props.scope === 'course'
      ? 'teacher.design.courseTtsModel.effectiveHint'
      : 'teacher.design.chapterTtsModel.effectiveHint';

  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <ConfiguredModelPickerPopover
        configuredProviders={configuredProviders}
        providerId={hasExplicitOverride ? explicitProviderId! : ''}
        modelId={hasExplicitOverride ? explicitModelId ?? '' : ''}
        onSelect={handleSelect}
        disabled={props.disabled || !providersReady}
        side="left"
        align="start"
        open={open}
        onOpenChange={setOpen}
        className="w-[min(640px,calc(100vw-2rem))]"
        providerAside={
          <button
            type="button"
            className={cn(
              'mb-1 flex h-10 w-full items-center rounded-md px-2 text-left text-xs transition-colors',
              !hasExplicitOverride
                ? 'bg-background font-medium text-foreground shadow-sm ring-1 ring-border/70'
                : 'text-muted-foreground hover:bg-background/70 hover:text-foreground',
            )}
            onClick={handleInherit}
          >
            {inheritLabel}
          </button>
        }
      >
        <Button
          variant="outline"
          size="sm"
          disabled={props.disabled || !providersReady}
          className="h-9 w-full justify-between text-sm font-normal"
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </ConfiguredModelPickerPopover>
      <p className="text-[11px] text-muted-foreground">
        {t(hintKey, {
          label: effectiveLabel,
          source: sourceLabel,
        })}
      </p>
    </div>
  );
}
