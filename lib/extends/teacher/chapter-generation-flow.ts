/**
 * @extends-from lib/teacher/chapter-generation-flow.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { buildWorkflowExecutionPlan } from '@/lib/generation/workflow';
import type { WorkflowConfig, WorkflowStepConfig } from '@/lib/generation/workflow/workflow-schema';
import type {
  CourseChapterClassroomGenerationStep,
  CourseChapterClassroomStatus,
} from '@/lib/teacher/course-types';

export type ChapterGenerationPhase =
  | 'idle'
  | 'outlining'
  | 'generating'
  | 'awaiting-approval'
  | 'ready'
  | 'failed';

export type FlowStepStatus =
  | 'pending'
  | 'running'
  | 'done'
  | 'failed'
  | 'skipped'
  | 'awaiting-approval';

export interface FlowStepDisplay {
  id: string;
  type: WorkflowStepConfig['type'];
  label: string;
  enabled: boolean;
  requiresApproval: boolean;
  status: FlowStepStatus;
}

export interface ChapterFlowStepDisplayOptions {
  readonly activeStepType?: CourseChapterClassroomGenerationStep;
  readonly failedStepType?: CourseChapterClassroomGenerationStep;
}

export function deriveChapterGenerationPhase(
  status: CourseChapterClassroomStatus | undefined,
  generationStep?: CourseChapterClassroomGenerationStep,
): ChapterGenerationPhase {
  if (status === 'awaiting-outline-approval') return 'awaiting-approval';
  if (status === 'ready' || status === 'published') return 'ready';
  if (status === 'failed') return 'failed';
  if (status === 'generating') {
    return generationStep === 'outline' ? 'outlining' : 'generating';
  }
  return 'idle';
}

function executionIndexForType(
  executionSteps: WorkflowStepConfig[],
  type: CourseChapterClassroomGenerationStep,
): number {
  return executionSteps.findIndex((step) => step.type === type);
}

function statusForStep(
  step: WorkflowStepConfig,
  phase: ChapterGenerationPhase,
  executionSteps: WorkflowStepConfig[],
  options: ChapterFlowStepDisplayOptions,
): FlowStepStatus {
  if (!step.enabled) return 'skipped';

  if (phase === 'awaiting-approval' && step.type === 'outline' && step.requiresApproval) {
    return 'awaiting-approval';
  }

  const execIndex = executionSteps.findIndex((s) => s.id === step.id);
  if (execIndex < 0) return 'skipped';

  if (phase === 'ready') return 'done';

  if (phase === 'failed') {
    const failedType = options.failedStepType ?? 'outline';
    const failedIndex = Math.max(0, executionIndexForType(executionSteps, failedType));
    if (execIndex < failedIndex) return 'done';
    if (execIndex === failedIndex) return 'failed';
    return 'pending';
  }

  if (phase === 'awaiting-approval') {
    if (step.type === 'outline') return 'awaiting-approval';
    return 'pending';
  }

  if (options.activeStepType) {
    const activeIndex = executionIndexForType(executionSteps, options.activeStepType);
    if (activeIndex >= 0) {
      if (execIndex < activeIndex) return 'done';
      if (execIndex === activeIndex) return 'running';
      return 'pending';
    }
  }

  if (phase === 'outlining') {
    if (step.type === 'outline') return 'running';
    return 'pending';
  }

  if (phase === 'generating') {
    if (step.type === 'outline') return 'done';
    if (step.type === 'persist') return 'pending';
    if (step.type === 'scene-content') return 'running';
    return 'pending';
  }

  return 'pending';
}

/**
 * Maps server run state (phase + optional active step) to per-step display status.
 */
export function buildChapterFlowStepDisplays(
  workflow: WorkflowConfig,
  phase: ChapterGenerationPhase,
  options: ChapterFlowStepDisplayOptions = {},
): FlowStepDisplay[] {
  const executionSteps = buildWorkflowExecutionPlan(workflow).map((step) => ({ ...step }));

  return workflow.steps.map((step) => ({
    id: step.id,
    type: step.type,
    label: step.label,
    enabled: step.enabled,
    requiresApproval: step.requiresApproval ?? false,
    status: statusForStep(step, phase, executionSteps, options),
  }));
}
