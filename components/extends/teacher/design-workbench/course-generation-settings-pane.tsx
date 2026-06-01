'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { GenerationSettingsFields } from '@/components/teacher/design-workbench/generation-settings-fields';
import { CourseModelSelectField } from './course-model-select-field';
import { CourseTtsModelSelectField } from './course-tts-model-select-field';
import type { GenerationMode } from '@/lib/slide-templates/types';
import type { SlideOutputFormat } from '@/lib/teacher/slide-output-format';
import type { GenerationProfile, WorkflowPresetId } from '@/lib/teacher/generation-profile';
import { useI18n } from '@/lib/hooks/use-i18n';
import { patchTeacherProject } from '@/lib/teacher/teacher-projects-client';
import { cn } from '@/lib/utils';

export interface CourseGenerationSettingsPaneProps {
  readonly projectId: string;
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
  readonly className?: string;
}

export function CourseGenerationSettingsPane({
  projectId,
  slideTemplateId,
  generationMode,
  slideOutputFormat = 'canvas',
  generationProfile,
  onUpdated,
  disabled,
  className,
}: CourseGenerationSettingsPaneProps) {
  const { t } = useI18n();
  const [saving, setSaving] = useState(false);

  const mergeGenerationProfile = useCallback(
  (
    patch: {
      slideOutputFormat?: SlideOutputFormat | null;
      generationProfile?: GenerationProfile;
    },
  ): GenerationProfile | undefined => {
    if (patch.slideOutputFormat === undefined && patch.generationProfile === undefined) {
      return undefined;
    }
    const workflowPresetId: WorkflowPresetId =
      patch.generationProfile?.workflowPresetId ??
      generationProfile?.workflowPresetId ??
      'default-course-generation';
    return {
      ...generationProfile,
      ...patch.generationProfile,
      workflowPresetId,
      ...(patch.slideOutputFormat !== undefined
        ? { slideOutputFormat: patch.slideOutputFormat ?? undefined }
        : {}),
    };
  },
  [generationProfile],
);

  const persist = useCallback(
    async (patch: {
      slideTemplateId?: string | null;
      generationMode?: GenerationMode | null;
      slideOutputFormat?: SlideOutputFormat | null;
      generationProfile?: GenerationProfile;
    }) => {
      setSaving(true);
      try {
        const mergedProfile = mergeGenerationProfile(patch);
        const profilePatch = mergedProfile ? { generationProfile: mergedProfile } : {};
        await patchTeacherProject(projectId, {
          ...(patch.slideTemplateId !== undefined ? { slideTemplateId: patch.slideTemplateId } : {}),
          ...(patch.generationMode !== undefined ? { generationMode: patch.generationMode } : {}),
          ...profilePatch,
        });
        onUpdated({
          ...(patch.slideTemplateId !== undefined
            ? { slideTemplateId: patch.slideTemplateId ?? undefined }
            : {}),
          ...(patch.generationMode !== undefined
            ? { generationMode: patch.generationMode ?? undefined }
            : {}),
          ...(patch.slideOutputFormat !== undefined || patch.generationProfile !== undefined
            ? {
                slideOutputFormat:
                  patch.generationProfile?.slideOutputFormat ??
                  patch.slideOutputFormat ??
                  slideOutputFormat,
                generationProfile: profilePatch.generationProfile,
              }
            : {}),
        });
        toast.success(t('teacher.design.generationSettings.saved'));
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : t('teacher.design.generationSettings.saveFailed'),
        );
      } finally {
        setSaving(false);
      }
    },
    [generationProfile, mergeGenerationProfile, onUpdated, projectId, slideOutputFormat, t],
  );

  const handleSlideTemplateChange = useCallback(
    (templateId: string | undefined) => {
      void persist({ slideTemplateId: templateId ?? null });
    },
    [persist],
  );

  const handleGenerationModeChange = useCallback(
    (mode: GenerationMode | undefined) => {
      void persist({ generationMode: mode ?? null });
    },
    [persist],
  );

  const handleSlideOutputFormatChange = useCallback(
    (format: SlideOutputFormat) => {
      void persist({ slideOutputFormat: format });
    },
    [persist],
  );

  const handleGenerationProfileChange = useCallback(
    (next: GenerationProfile | undefined) => {
      void persist({ generationProfile: next });
    },
    [persist],
  );

  const fieldDisabled = disabled || saving;

  return (
    <div className={cn('space-y-4', className)}>
      <CourseModelSelectField
        generationProfile={generationProfile}
        disabled={fieldDisabled}
        onChange={handleGenerationProfileChange}
      />
      <CourseTtsModelSelectField
        generationProfile={generationProfile}
        disabled={fieldDisabled}
        onChange={handleGenerationProfileChange}
      />
      <GenerationSettingsFields
        slideTemplateId={slideTemplateId}
        generationMode={generationMode}
        slideOutputFormat={slideOutputFormat}
        projectId={projectId}
        onSlideTemplateChange={handleSlideTemplateChange}
        onGenerationModeChange={handleGenerationModeChange}
        onSlideOutputFormatChange={handleSlideOutputFormatChange}
        disabled={fieldDisabled}
      />
    </div>
  );
}
