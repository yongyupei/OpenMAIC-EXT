/**
 * @extends-from lib/teacher/generation-profile.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { z } from 'zod';

import { workflowStepTypes } from '@/lib/generation/workflow/workflow-schema';
import type { WorkflowConfig } from '@/lib/generation/workflow/workflow-schema';
import type { GenerationMode } from '@/lib/slide-templates/types';
import { SLIDE_OUTPUT_FORMATS } from '@/lib/teacher/slide-output-format';
import type { PromptId } from '@/lib/prompts/types';

/** Built-in workflow presets selectable in phase 1 (no custom project workflows). */
export const WORKFLOW_PRESET_IDS = [
  'default-course-generation',
  'outline-approval',
  'fast-slides',
] as const;

export type WorkflowPresetId = (typeof WORKFLOW_PRESET_IDS)[number];

export const workflowPresetIdSchema = z.enum(WORKFLOW_PRESET_IDS);

export const workflowStepOverrideSchema = z.object({
  enabled: z.boolean().optional(),
  requiresApproval: z.boolean().optional(),
  modelId: z.string().optional(),
  label: z.string().optional(),
});

export const promptOverrideSchema = z.object({
  system: z.string().max(24_000).optional(),
  user: z.string().max(24_000).optional(),
});

export const generationProfileSchema = z.object({
  workflowPresetId: workflowPresetIdSchema.default('default-course-generation'),
  stepOverrides: z
    .object(
      Object.fromEntries(
        workflowStepTypes.map((stepType) => [stepType, workflowStepOverrideSchema.optional()]),
      ) as Record<(typeof workflowStepTypes)[number], z.ZodOptional<typeof workflowStepOverrideSchema>>,
    )
    .partial()
    .optional(),
  slideTemplateId: z.string().optional(),
  generationMode: z
    .enum(['material-driven', 'requirement-driven', 'hybrid'] as const)
    .optional(),
  slideOutputFormat: z.enum(SLIDE_OUTPUT_FORMATS).optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
  /** Required for server-side resolution of client-only custom providers (`custom-*`). */
  providerType: z.enum(['openai', 'anthropic', 'google']).optional(),
  /** TTS provider for chapter/course generation (server-side narration). */
  ttsProviderId: z.string().optional(),
  /** TTS model id for chapter/course generation. */
  ttsModelId: z.string().optional(),
  promptOverrides: z.record(z.string(), promptOverrideSchema).optional(),
  revision: z.number().int().nonnegative().optional(),
});

export type GenerationProfile = z.infer<typeof generationProfileSchema>;

export type WorkflowStepOverride = z.infer<typeof workflowStepOverrideSchema>;

export type PromptOverride = z.infer<typeof promptOverrideSchema>;

/** Chapter may override a subset of the course generation profile. */
export const generationProfileOverrideSchema = generationProfileSchema.partial();

export type GenerationProfileOverride = z.infer<typeof generationProfileOverrideSchema>;

export interface ResolvedGenerationProfile {
  workflowPresetId: WorkflowPresetId;
  workflow: WorkflowConfig;
  slideTemplateId?: string;
  generationMode: GenerationMode;
  slideOutputFormat: import('@/lib/teacher/slide-output-format').SlideOutputFormat;
  promptOverrides: Partial<Record<PromptId, PromptOverride>>;
  revision: number;
}
