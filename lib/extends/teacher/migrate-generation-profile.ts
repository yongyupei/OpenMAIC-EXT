/**
 * @extends-from lib/teacher/migrate-generation-profile.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import type { CourseChapter, CourseProject } from '@/lib/teacher/course-types';
import type { GenerationProfile, GenerationProfileOverride } from '@/lib/teacher/generation-profile';
import {
  generationProfileSchema,
  workflowPresetIdSchema,
} from '@/lib/teacher/generation-profile';

/**
 * Merges course-level profile with optional chapter overrides and legacy
 * slideTemplateId / generationMode fields from project or chapter.
 */
export function mergeGenerationProfileLayers(
  project: CourseProject,
  chapter?: CourseChapter | null,
): GenerationProfile {
  const courseRaw = {
    ...project.generationProfile,
    slideTemplateId:
      chapter?.slideTemplateId ??
      project.generationProfile?.slideTemplateId ??
      project.slideTemplateId,
    generationMode:
      chapter?.generationMode ??
      project.generationProfile?.generationMode ??
      project.generationMode,
    slideOutputFormat:
      project.generationProfile?.slideOutputFormat,
  };

  const chapterRaw: GenerationProfileOverride | undefined = chapter?.generationProfileOverride;

  const stepOverrides = {
    ...courseRaw.stepOverrides,
    ...chapterRaw?.stepOverrides,
  };
  const hasStepOverrides = Object.values(stepOverrides).some((v) => v != null);

  const merged: GenerationProfile = {
    workflowPresetId:
      chapterRaw?.workflowPresetId ??
      courseRaw.workflowPresetId ??
      'default-course-generation',
    ...(hasStepOverrides ? { stepOverrides } : {}),
    slideTemplateId:
      chapterRaw?.slideTemplateId ?? courseRaw.slideTemplateId,
    generationMode:
      chapterRaw?.generationMode ?? courseRaw.generationMode ?? 'hybrid',
    slideOutputFormat:
      chapterRaw?.slideOutputFormat ?? courseRaw.slideOutputFormat,
    promptOverrides: {
      ...courseRaw.promptOverrides,
      ...chapterRaw?.promptOverrides,
    },
    providerId: chapterRaw?.providerId ?? courseRaw.providerId,
    modelId: chapterRaw?.modelId ?? courseRaw.modelId,
    providerType: chapterRaw?.providerType ?? courseRaw.providerType,
    ttsProviderId: chapterRaw?.ttsProviderId ?? courseRaw.ttsProviderId,
    ttsModelId: chapterRaw?.ttsModelId ?? courseRaw.ttsModelId,
    revision: Math.max(
      courseRaw.revision ?? 0,
      chapterRaw?.revision ?? 0,
    ),
  };

  const presetParsed = workflowPresetIdSchema.safeParse(merged.workflowPresetId);
  const sanitized = {
    ...merged,
    workflowPresetId: presetParsed.success
      ? presetParsed.data
      : ('default-course-generation' as const),
  };

  return generationProfileSchema.parse(sanitized);
}
