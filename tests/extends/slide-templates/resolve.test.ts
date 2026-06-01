/**
 * @extends-from tests/slide-templates/resolve.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, it } from 'vitest';

import { resolveGenerationMode, resolveSlideTemplate, resolveSlideTemplateById } from '@/lib/slide-templates/resolve';
import type { CourseChapter, CourseProject } from '@/lib/teacher/course-types';

const baseProject: CourseProject = {
  id: 'p1',
  title: 'T',
  requirements: { requirement: 'req' },
  chapterCount: 1,
  workflowTemplateId: 'standard-course' as const,
  status: 'draft' as const,
  createdAt: '',
  updatedAt: '',
  artifacts: [],
};

const baseChapter: CourseChapter = {
  id: 'c1',
  title: 'Ch',
  learningObjectives: [],
  sceneOutlines: [],
  status: 'draft',
  dirty: false,
  locked: false,
  order: 0,
};

describe('resolveGenerationMode', () => {
  it('defaults to material-driven when reference text exists', () => {
    expect(
      resolveGenerationMode(baseProject, baseChapter, ' ## Section\ncontent'),
    ).toBe('material-driven');
  });

  it('defaults to requirement-driven when reference empty', () => {
    expect(resolveGenerationMode(baseProject, baseChapter, '')).toBe('requirement-driven');
  });

  it('defaults to requirement-driven when reference is undefined', () => {
    expect(resolveGenerationMode(baseProject, baseChapter, undefined)).toBe('requirement-driven');
  });

  it('chapter override wins', () => {
    expect(
      resolveGenerationMode(
        { ...baseProject, generationMode: 'hybrid' },
        { ...baseChapter, generationMode: 'requirement-driven' },
        'text',
      ),
    ).toBe('requirement-driven');
  });

  it('project override wins when chapter has no mode', () => {
    expect(
      resolveGenerationMode(
        { ...baseProject, generationMode: 'hybrid' },
        baseChapter,
        'text',
      ),
    ).toBe('hybrid');
  });
});

describe('resolveSlideTemplate', () => {
  it('uses chapter slideTemplateId over project', async () => {
    const result = await resolveSlideTemplate(
      { ...baseProject, slideTemplateId: 'builtin:theme-business-navy' },
      { ...baseChapter, slideTemplateId: 'builtin:theme-business-black' },
      'p1',
    );
    expect(result.record.id).toBe('builtin:theme-business-black');
    expect(result.source).toBe('chapter');
    expect(result.missingTemplateIds).toEqual([]);
  });

  it('uses project slideTemplateId when chapter has none', async () => {
    const result = await resolveSlideTemplate(
      { ...baseProject, slideTemplateId: 'builtin:theme-business-indigo' },
      baseChapter,
      'p1',
    );
    expect(result.record.id).toBe('builtin:theme-business-indigo');
    expect(result.source).toBe('project');
    expect(result.missingTemplateIds).toEqual([]);
  });

  it('falls back to builtin default when no template is set', async () => {
    const result = await resolveSlideTemplate(baseProject, baseChapter, 'p1');
    expect(result.record.id).toBe('builtin:default-professional');
    expect(result.source).toBe('builtin');
    expect(result.missingTemplateIds).toEqual([]);
  });

  it('records invalid template ids and falls back to builtin default', async () => {
    const result = await resolveSlideTemplate(
      { ...baseProject, slideTemplateId: 'missing:project-template' },
      { ...baseChapter, slideTemplateId: 'missing:chapter-template' },
      'p1',
    );
    expect(result.record.id).toBe('builtin:default-professional');
    expect(result.source).toBe('builtin');
    expect(result.missingTemplateIds).toEqual([
      'missing:chapter-template',
      'missing:project-template',
    ]);
  });
});

describe('resolveSlideTemplateById', () => {
  it('resolves a builtin template by id', async () => {
    const result = await resolveSlideTemplateById('builtin:theme-business-navy');
    expect(result.record.id).toBe('builtin:theme-business-navy');
    expect(result.source).toBe('builtin');
  });

  it('falls back to builtin default when id is missing or unknown', async () => {
    const missing = await resolveSlideTemplateById('missing:template');
    expect(missing.record.id).toBe('builtin:default-professional');

    const unset = await resolveSlideTemplateById(undefined);
    expect(unset.record.id).toBe('builtin:default-professional');
  });
});
