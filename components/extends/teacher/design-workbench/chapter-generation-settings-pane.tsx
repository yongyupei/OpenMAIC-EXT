'use client';

import { useEffect, useMemo, useState } from 'react';

import { SlideTemplatePicker, resolveTemplateName } from '@/components/slide-templates/slide-template-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { fetchSlideTemplates } from '@/lib/slide-templates/client';
import type { GenerationMode, SlideTemplateRecord } from '@/lib/slide-templates/types';
import type { GenerationProfile, GenerationProfileOverride } from '@/lib/teacher/generation-profile';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';
import { ChapterModelSelectField } from './chapter-model-select-field';
import { ChapterTtsModelSelectField } from './chapter-tts-model-select-field';

const INHERIT_VALUE = '__inherit__';
const GENERATION_MODES: GenerationMode[] = [
  'material-driven',
  'requirement-driven',
  'hybrid',
];

export interface ChapterGenerationSettingsPaneProps {
  readonly slideTemplateId?: string;
  readonly generationMode?: GenerationMode;
  readonly generationProfileOverride?: GenerationProfileOverride;
  readonly courseSlideTemplateId?: string;
  readonly courseGenerationMode?: GenerationMode;
  readonly courseGenerationProfile?: GenerationProfile;
  readonly projectId?: string;
  readonly onSlideTemplateChange: (templateId: string | undefined) => void;
  readonly onGenerationModeChange: (mode: GenerationMode | undefined) => void;
  readonly onGenerationProfileOverrideChange: (
    override: GenerationProfileOverride | undefined,
  ) => void;
  readonly disabled?: boolean;
  readonly className?: string;
}

export function ChapterGenerationSettingsPane({
  slideTemplateId,
  generationMode,
  generationProfileOverride,
  courseSlideTemplateId,
  courseGenerationMode,
  courseGenerationProfile,
  projectId,
  onSlideTemplateChange,
  onGenerationModeChange,
  onGenerationProfileOverrideChange,
  disabled,
  className,
}: ChapterGenerationSettingsPaneProps) {
  const { t } = useI18n();
  const [templates, setTemplates] = useState<SlideTemplateRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    void fetchSlideTemplates({
      includeBuiltin: true,
      ...(projectId ? { projectId } : {}),
    })
      .then((records) => {
        if (!cancelled) setTemplates(records);
      })
      .catch(() => {
        if (!cancelled) setTemplates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const effectiveTemplateId = slideTemplateId ?? courseSlideTemplateId;
  const effectiveTemplateName = useMemo(
    () => resolveTemplateName(templates, effectiveTemplateId),
    [effectiveTemplateId, templates],
  );

  const effectiveMode = generationMode ?? courseGenerationMode;

  return (
    <div className={cn('space-y-4', className)}>
      <div className="space-y-2">
        <Label className="text-xs">{t('teacher.design.slideTemplate.label')}</Label>
        <SlideTemplatePicker
          value={slideTemplateId}
          onChange={onSlideTemplateChange}
          projectId={projectId}
          allowInherit
          disabled={disabled}
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs">{t('teacher.design.generationMode.label')}</Label>
        <Select
          value={generationMode ?? INHERIT_VALUE}
          onValueChange={(next) =>
            onGenerationModeChange(next === INHERIT_VALUE ? undefined : (next as GenerationMode))
          }
          disabled={disabled}
        >
          <SelectTrigger className="h-9 w-full text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={INHERIT_VALUE} className="text-sm">
              {t('teacher.design.generationMode.inheritCourseDefault')}
            </SelectItem>
            {GENERATION_MODES.map((mode) => (
              <SelectItem key={mode} value={mode} className="text-sm">
                {t(`teacher.design.generationMode.${modeToKey(mode)}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ChapterModelSelectField
        generationProfileOverride={generationProfileOverride}
        courseGenerationProfile={courseGenerationProfile}
        disabled={disabled}
        onChange={onGenerationProfileOverrideChange}
      />

      <ChapterTtsModelSelectField
        generationProfileOverride={generationProfileOverride}
        courseGenerationProfile={courseGenerationProfile}
        disabled={disabled}
        onChange={onGenerationProfileOverrideChange}
      />

      {effectiveTemplateName || effectiveMode ? (
        <p className="text-[11px] text-muted-foreground">
          {effectiveTemplateName
            ? t('teacher.design.slideTemplate.effectiveHint', { name: effectiveTemplateName })
            : null}
          {effectiveTemplateName && effectiveMode ? ' · ' : null}
          {effectiveMode ? t(`teacher.design.generationMode.${modeToKey(effectiveMode)}`) : null}
        </p>
      ) : null}
    </div>
  );
}

function modeToKey(mode: GenerationMode): 'materialDriven' | 'requirementDriven' | 'hybrid' {
  switch (mode) {
    case 'material-driven':
      return 'materialDriven';
    case 'requirement-driven':
      return 'requirementDriven';
    case 'hybrid':
      return 'hybrid';
  }
}
