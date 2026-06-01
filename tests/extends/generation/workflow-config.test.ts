/**
 * @extends-from tests/generation/workflow-config.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, test } from 'vitest';
import {
  buildWorkflowExecutionPlan,
  defaultWorkflowConfig,
  workflowConfigSchema,
} from '@/lib/generation/workflow';

describe('workflow configuration', () => {
  test('validates the default workflow preset', () => {
    const parsed = workflowConfigSchema.parse(defaultWorkflowConfig);

    expect(parsed.version).toBe(1);
    expect(parsed.steps.map((step) => step.type)).toEqual([
      'outline',
      'scene-content',
      'scene-actions',
      'media',
      'tts',
      'persist',
    ]);
  });

  test('builds an execution plan that skips disabled optional steps', () => {
    const plan = buildWorkflowExecutionPlan({
      ...defaultWorkflowConfig,
      steps: defaultWorkflowConfig.steps.map((step) =>
        step.type === 'media' || step.type === 'tts' ? { ...step, enabled: false } : step,
      ),
    });

    expect(plan.map((step) => step.type)).toEqual([
      'outline',
      'scene-content',
      'scene-actions',
      'persist',
    ]);
  });

  test('rejects a workflow that omits persistence', () => {
    expect(() =>
      workflowConfigSchema.parse({
        ...defaultWorkflowConfig,
        steps: defaultWorkflowConfig.steps.filter((step) => step.type !== 'persist'),
      }),
    ).toThrow();
  });
});
