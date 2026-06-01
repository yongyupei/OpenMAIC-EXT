/**
 * @extends-from lib/generation/workflow/workflow-schema.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { z } from 'zod';

export const workflowStepTypes = [
  'outline',
  'scene-content',
  'scene-actions',
  'media',
  'tts',
  'persist',
] as const;

export type WorkflowStepType = (typeof workflowStepTypes)[number];

export const workflowStepSchema = z.object({
  id: z.string().min(1),
  type: z.enum(workflowStepTypes),
  enabled: z.boolean().default(true),
  label: z.string().min(1),
  requiresApproval: z.boolean().default(false),
  modelId: z.string().optional(),
});

export const workflowConfigSchema = z
  .object({
    id: z.string().min(1),
    version: z.literal(1),
    name: z.string().min(1),
    description: z.string().optional(),
    steps: z.array(workflowStepSchema).min(1),
  })
  .superRefine((config, context) => {
    const enabledTypes = new Set(
      config.steps.filter((step) => step.enabled).map((step) => step.type),
    );
    if (!enabledTypes.has('outline')) {
      context.addIssue({
        code: 'custom',
        path: ['steps'],
        message: 'Workflow must include an enabled outline step',
      });
    }
    if (!enabledTypes.has('persist')) {
      context.addIssue({
        code: 'custom',
        path: ['steps'],
        message: 'Workflow must include an enabled persist step',
      });
    }
  });

export type WorkflowStepConfig = z.infer<typeof workflowStepSchema>;
export type WorkflowConfig = z.infer<typeof workflowConfigSchema>;
