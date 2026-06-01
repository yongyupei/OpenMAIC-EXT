/**
 * @extends-from lib/teacher/resolve-generation-profile.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { workflowConfigSchema } from '@/lib/generation/workflow';
import { workflowPresets } from '@/lib/generation/workflow/workflow-presets';
import type { WorkflowConfig } from '@/lib/generation/workflow/workflow-schema';
import type { GenerationMode } from '@/lib/slide-templates/types';
import { slideOutputFormatSchema } from '@/lib/teacher/slide-output-format';
import { sanitizePromptOverrides } from '@/lib/prompts/generation-prompt-allowlist';
import type { PromptId } from '@/lib/prompts/types';

import type { CourseChapter, CourseProject } from '@/lib/teacher/course-types';
import {
  type GenerationProfile,
  type PromptOverride,
  type ResolvedGenerationProfile,
  type WorkflowPresetId,
  type WorkflowStepOverride,
  WORKFLOW_PRESET_IDS,
  workflowPresetIdSchema,
} from '@/lib/teacher/generation-profile';
import { mergeGenerationProfileLayers } from '@/lib/teacher/migrate-generation-profile';

const presetById = new Map<string, WorkflowConfig>(
  workflowPresets.map((preset) => [preset.id, preset]),
);

function resolvePresetId(profile: GenerationProfile): WorkflowPresetId {
  const parsed = workflowPresetIdSchema.safeParse(profile.workflowPresetId);
  if (parsed.success) return parsed.data;
  return 'default-course-generation';
}

function applyStepOverrides(
  config: WorkflowConfig,
  overrides: GenerationProfile['stepOverrides'] | undefined,
): WorkflowConfig {
  if (!overrides || Object.keys(overrides).length === 0) {
    return config;
  }

  return {
    ...config,
    steps: config.steps.map((step) => {
      const override = overrides[step.type] as WorkflowStepOverride | undefined;
      if (!override) return step;
      return {
        ...step,
        ...override,
        id: step.id,
        type: step.type,
      };
    }),
  };
}

export function resolveGenerationProfile(
  project: CourseProject,
  chapter?: CourseChapter | null,
): ResolvedGenerationProfile {
  const mergedProfile = mergeGenerationProfileLayers(project, chapter);
  const workflowPresetId = resolvePresetId(mergedProfile);
  const basePreset =
    presetById.get(workflowPresetId) ?? presetById.get('default-course-generation')!;
  const workflow = workflowConfigSchema.parse(
    applyStepOverrides(basePreset, mergedProfile.stepOverrides),
  );

  const generationMode = (mergedProfile.generationMode ?? 'hybrid') as GenerationMode;

  const promptOverrides = (sanitizePromptOverrides(mergedProfile.promptOverrides) ??
    {}) as Partial<Record<PromptId, PromptOverride>>;

  const slideOutputFormat =
    mergedProfile.slideOutputFormat ??
    slideOutputFormatSchema.parse(undefined);

  return {
    workflowPresetId,
    workflow,
    slideTemplateId: mergedProfile.slideTemplateId,
    generationMode,
    slideOutputFormat,
    promptOverrides,
    revision: mergedProfile.revision ?? 0,
  };
}

/** Serializable preset list for APIs (phase 1: built-in presets only). */
export function listWorkflowPresetsForApi(): WorkflowConfig[] {
  return WORKFLOW_PRESET_IDS.map((id) => presetById.get(id)!);
}
