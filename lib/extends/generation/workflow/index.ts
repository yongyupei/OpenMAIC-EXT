/**
 * @extends-from lib/generation/workflow/index.ts
 * @fork-branch feat/html-slide-design-workbench
 */
export {
  workflowConfigSchema,
  workflowStepSchema,
  workflowStepTypes,
  type WorkflowConfig,
  type WorkflowStepConfig,
  type WorkflowStepType,
} from '@/lib/generation/workflow/workflow-schema';
export { defaultWorkflowConfig, workflowPresets } from '@/lib/generation/workflow/workflow-presets';
export {
  buildWorkflowExecutionPlan,
  type WorkflowExecutionStep,
} from '@/lib/generation/workflow/workflow-runner';
