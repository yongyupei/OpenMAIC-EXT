/**
 * @extends-from tests/teacher/resolve-generation-profile.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, it } from 'vitest';

import { defaultWorkflowConfig } from '@/lib/generation/workflow';
import type { CourseChapter, CourseProject } from '@/lib/teacher/course-types';
import { resolveGenerationProfile } from '@/lib/teacher/resolve-generation-profile';
import { WORKFLOW_PRESET_IDS } from '@/lib/teacher/generation-profile';

const baseProject: CourseProject = {
  id: 'p1',
  title: 'Course',
  requirements: { requirement: 'req' },
  chapterCount: 1,
  workflowTemplateId: 'standard-course',
  status: 'draft',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  artifacts: [],
  slideTemplateId: 'builtin:theme-business-navy',
  generationMode: 'hybrid',
};

const baseChapter: CourseChapter = {
  id: 'ch1',
  title: 'Chapter 1',
  learningObjectives: [],
  sceneOutlines: [],
  status: 'draft',
  dirty: false,
  locked: false,
  order: 0,
};

describe('resolveGenerationProfile', () => {
  it('exposes exactly three workflow presets for phase 1', () => {
    expect(WORKFLOW_PRESET_IDS).toEqual([
      'default-course-generation',
      'outline-approval',
      'fast-slides',
    ]);
  });

  it('defaults to default-course-generation preset', () => {
    const resolved = resolveGenerationProfile(baseProject);
    expect(resolved.workflowPresetId).toBe('default-course-generation');
    expect(resolved.workflow.id).toBe('default-course-generation');
    expect(resolved.generationMode).toBe('hybrid');
    expect(resolved.slideTemplateId).toBe('builtin:theme-business-navy');
  });

  it('merges chapter generationMode override', () => {
    const resolved = resolveGenerationProfile(baseProject, {
      ...baseChapter,
      generationMode: 'material-driven',
    });
    expect(resolved.generationMode).toBe('material-driven');
  });

  it('applies stepOverrides to disable media and tts', () => {
    const resolved = resolveGenerationProfile({
      ...baseProject,
      generationProfile: {
        workflowPresetId: 'fast-slides',
        stepOverrides: {},
      },
    });
    const types = resolved.workflow.steps.filter((s) => s.enabled).map((s) => s.type);
    expect(types).not.toContain('media');
    expect(types).not.toContain('tts');
    expect(types).toContain('persist');
  });

  it('uses outline-approval preset requiresApproval on outline step', () => {
    const resolved = resolveGenerationProfile({
      ...baseProject,
      generationProfile: { workflowPresetId: 'outline-approval' },
    });
    const outline = resolved.workflow.steps.find((s) => s.type === 'outline');
    expect(outline?.requiresApproval).toBe(true);
  });

  it('migrates legacy slideTemplateId and generationMode into profile fields', () => {
    const resolved = resolveGenerationProfile({
      ...baseProject,
      generationProfile: undefined,
      slideTemplateId: 'builtin:default-professional',
      generationMode: 'requirement-driven',
    });
    expect(resolved.slideTemplateId).toBe('builtin:default-professional');
    expect(resolved.generationMode).toBe('requirement-driven');
  });

  it('falls back to default preset for unknown workflowPresetId', () => {
    const resolved = resolveGenerationProfile({
      ...baseProject,
      generationProfile: {
        workflowPresetId: 'unknown-preset' as 'default-course-generation',
      },
    });
    expect(resolved.workflowPresetId).toBe('default-course-generation');
    expect(resolved.workflow.id).toBe(defaultWorkflowConfig.id);
  });
});
