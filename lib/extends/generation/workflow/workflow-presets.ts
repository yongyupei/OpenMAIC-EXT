/**
 * @extends-from lib/generation/workflow/workflow-presets.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import type { WorkflowConfig } from '@/lib/generation/workflow/workflow-schema';

export const defaultWorkflowConfig: WorkflowConfig = {
  id: 'default-course-generation',
  version: 1,
  name: 'Default course generation',
  description:
    'Generate outlines, scenes, actions, optional media/TTS, then persist the classroom.',
  steps: [
    {
      id: 'outline',
      type: 'outline',
      enabled: true,
      label: 'Generate outline',
      requiresApproval: false,
    },
    {
      id: 'scene-content',
      type: 'scene-content',
      enabled: true,
      label: 'Generate scene content',
      requiresApproval: false,
    },
    {
      id: 'scene-actions',
      type: 'scene-actions',
      enabled: true,
      label: 'Generate narration and actions',
      requiresApproval: false,
    },
    {
      id: 'media',
      type: 'media',
      enabled: true,
      label: 'Generate media',
      requiresApproval: false,
    },
    {
      id: 'tts',
      type: 'tts',
      enabled: true,
      label: 'Generate speech audio',
      requiresApproval: false,
    },
    {
      id: 'persist',
      type: 'persist',
      enabled: true,
      label: 'Persist classroom',
      requiresApproval: false,
    },
  ],
};

export const workflowPresets: WorkflowConfig[] = [
  defaultWorkflowConfig,
  {
    ...defaultWorkflowConfig,
    id: 'outline-approval',
    name: 'Outline approval',
    description: 'Pause for human review after the outline before generating scenes.',
    steps: defaultWorkflowConfig.steps.map((step) =>
      step.type === 'outline' ? { ...step, requiresApproval: true } : step,
    ),
  },
  {
    ...defaultWorkflowConfig,
    id: 'fast-slides',
    name: 'Fast slides',
    description: 'Skip media and TTS for fast editable course drafts.',
    steps: defaultWorkflowConfig.steps.map((step) =>
      step.type === 'media' || step.type === 'tts' ? { ...step, enabled: false } : step,
    ),
  },
];
