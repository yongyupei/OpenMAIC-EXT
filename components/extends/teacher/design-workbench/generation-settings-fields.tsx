/**
 * @extends-from components/teacher/design-workbench/generation-settings-fields.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import Link from 'next/link';

import { SlideTemplatePicker } from '@/components/slide-templates/slide-template-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import type { GenerationMode } from '@/lib/slide-templates/types';
import type { SlideOutputFormat } from '@/lib/teacher/slide-output-format';
import { SLIDE_OUTPUT_FORMATS } from '@/lib/teacher/slide-output-format';
import { useI18n } from '@/lib/hooks/use-i18n';

const GENERATION_MODES: GenerationMode[] = [
  'material-driven',
  'requirement-driven',
  'hybrid',
];

export interface GenerationSettingsFieldsProps {
  readonly slideTemplateId?: string;
  readonly generationMode?: GenerationMode;
  readonly slideOutputFormat?: SlideOutputFormat;
  readonly projectId?: string;
  readonly onSlideTemplateChange: (templateId: string | undefined) => void;
  readonly onGenerationModeChange: (mode: GenerationMode | undefined) => void;
  readonly onSlideOutputFormatChange?: (format: SlideOutputFormat) => void;
  readonly disabled?: boolean;
}

export function GenerationSettingsFields({
  slideTemplateId,
  generationMode,
  slideOutputFormat = 'canvas',
  projectId,
  onSlideTemplateChange,
  onGenerationModeChange,
  onSlideOutputFormatChange,
  disabled,
}: GenerationSettingsFieldsProps) {
  const { t } = useI18n();

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs">{t('teacher.design.slideTemplate.label')}</Label>
          <Link
            href="/slide-templates"
            className="text-[11px] text-primary underline-offset-2 hover:underline"
          >
            {t('slideTemplates.manageLink')}
          </Link>
        </div>
        <SlideTemplatePicker
          value={slideTemplateId}
          onChange={onSlideTemplateChange}
          projectId={projectId}
          disabled={disabled}
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs">{t('teacher.design.generationMode.label')}</Label>
        <Select
          {...(generationMode ? { value: generationMode } : {})}
          onValueChange={(next) => onGenerationModeChange(next as GenerationMode)}
          disabled={disabled}
        >
          <SelectTrigger className="h-9 w-full text-sm">
            <SelectValue placeholder={t('teacher.design.generationMode.label')} />
          </SelectTrigger>
          <SelectContent>
            {GENERATION_MODES.map((mode) => (
              <SelectItem key={mode} value={mode} className="text-sm">
                {t(`teacher.design.generationMode.${modeToKey(mode)}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {onSlideOutputFormatChange ? (
        <div className="space-y-2">
          <Label className="text-xs">{t('teacher.design.slideOutputFormat.label')}</Label>
          <Select
            value={slideOutputFormat}
            onValueChange={(next) => onSlideOutputFormatChange(next as SlideOutputFormat)}
            disabled={disabled}
          >
            <SelectTrigger className="h-9 w-full text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SLIDE_OUTPUT_FORMATS.map((format) => (
                <SelectItem key={format} value={format} className="text-sm">
                  {t(`teacher.design.slideOutputFormat.${format}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            {t('teacher.design.slideOutputFormat.htmlHint')}
          </p>
        </div>
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
