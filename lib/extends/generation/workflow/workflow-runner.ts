/**
 * @extends-from lib/generation/workflow/workflow-runner.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import {
  workflowConfigSchema,
  type WorkflowConfig,
  type WorkflowStepConfig,
} from '@/lib/generation/workflow/workflow-schema';

export interface WorkflowExecutionStep extends WorkflowStepConfig {
  index: number;
}

export function buildWorkflowExecutionPlan(config: WorkflowConfig): WorkflowExecutionStep[] {
  const parsed = workflowConfigSchema.parse(config);
  return parsed.steps
    .filter((step) => step.enabled)
    .map((step, index) => ({
      ...step,
      index,
    }));
}
