/**
 * @extends-from tests/teacher/chapter-generation-flow.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, it } from 'vitest';

import { workflowPresets } from '@/lib/generation/workflow/workflow-presets';
import {
  buildChapterFlowStepDisplays,
  deriveChapterGenerationPhase,
} from '@/lib/teacher/chapter-generation-flow';

describe('deriveChapterGenerationPhase', () => {
  it('maps outline step to outlining phase', () => {
    expect(deriveChapterGenerationPhase('generating', 'outline')).toBe('outlining');
  });

  it('maps scene steps to generating phase', () => {
    expect(deriveChapterGenerationPhase('generating', 'scene-content')).toBe('generating');
  });

  it('maps awaiting-outline-approval status', () => {
    expect(deriveChapterGenerationPhase('awaiting-outline-approval')).toBe('awaiting-approval');
  });
});

describe('buildChapterFlowStepDisplays', () => {
  const defaultPreset = workflowPresets[0]!;

  it('marks outline running during outlining phase', () => {
    const steps = buildChapterFlowStepDisplays(defaultPreset, 'outlining');
    const outline = steps.find((s) => s.type === 'outline');
    expect(outline?.status).toBe('running');
  });

  it('marks only the active step as running when activeStepType is set', () => {
    const steps = buildChapterFlowStepDisplays(defaultPreset, 'generating', {
      activeStepType: 'scene-actions',
    });
    expect(steps.find((s) => s.type === 'outline')?.status).toBe('done');
    expect(steps.find((s) => s.type === 'scene-content')?.status).toBe('done');
    expect(steps.find((s) => s.type === 'scene-actions')?.status).toBe('running');
    expect(steps.find((s) => s.type === 'media')?.status).toBe('pending');
  });

  it('marks media and tts skipped for fast-slides preset', () => {
    const fast = workflowPresets.find((p) => p.id === 'fast-slides')!;
    const steps = buildChapterFlowStepDisplays(fast, 'generating', {
      activeStepType: 'scene-content',
    });
    expect(steps.find((s) => s.type === 'media')?.status).toBe('skipped');
    expect(steps.find((s) => s.type === 'tts')?.status).toBe('skipped');
  });

  it('shows awaiting-approval on outline when phase is awaiting-approval', () => {
    const approval = workflowPresets.find((p) => p.id === 'outline-approval')!;
    const steps = buildChapterFlowStepDisplays(approval, 'awaiting-approval');
    expect(steps.find((s) => s.type === 'outline')?.status).toBe('awaiting-approval');
  });

  it('marks failed step when failedStepType is provided', () => {
    const steps = buildChapterFlowStepDisplays(defaultPreset, 'failed', {
      failedStepType: 'media',
    });
    expect(steps.find((s) => s.type === 'media')?.status).toBe('failed');
    expect(steps.find((s) => s.type === 'outline')?.status).toBe('done');
    expect(steps.find((s) => s.type === 'persist')?.status).toBe('pending');
  });
});
