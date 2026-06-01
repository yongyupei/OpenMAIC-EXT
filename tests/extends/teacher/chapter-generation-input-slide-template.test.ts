/**
 * @extends-from tests/teacher/chapter-generation-input-slide-template.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { prepareChapterGenerationInput } from '@/lib/teacher/chapter-generation-input';
import type { CourseChapter, CourseProject } from '@/lib/teacher/course-types';

vi.mock('@/lib/knowledge-base/resolve-mount-context', () => ({
  resolveKnowledgeMountContext: vi.fn(),
}));

vi.mock('@/lib/teacher/chapter-reference', () => ({
  readChapterReferenceText: vi.fn(),
}));

const { resolveKnowledgeMountContext } = await import(
  '@/lib/knowledge-base/resolve-mount-context'
);
const { readChapterReferenceText } = await import('@/lib/teacher/chapter-reference');

const mockAiCall = vi.fn(async () => '');

function mockProject(overrides: Partial<CourseProject> = {}): CourseProject {
  return {
    id: 'proj-1',
    title: 'Intro to AI',
    overview: 'Course overview text',
    requirements: { requirement: 'Teach AI basics' },
    chapterCount: 1,
    workflowTemplateId: 'standard-course',
    artifacts: [],
    status: 'draft',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function mockChapter(overrides: Partial<CourseChapter> = {}): CourseChapter {
  return {
    id: 'ch-1',
    title: 'Neural Networks',
    learningObjectives: ['Explain perceptrons'],
    sceneOutlines: [],
    status: 'draft',
    dirty: false,
    locked: false,
    order: 0,
    deepSearchEnabled: false,
    knowledgeNodeIds: ['kb-node-1'],
    ...overrides,
  };
}

describe('prepareChapterGenerationInput slide template integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveKnowledgeMountContext).mockResolvedValue({
      referenceText: 'Knowledge base excerpt with section content.',
      missingNodeIds: [],
      unsupported: [],
    });
    vi.mocked(readChapterReferenceText).mockResolvedValue('');
  });

  it('defaults generationMode to material-driven when reference text is non-empty', async () => {
    const input = await prepareChapterGenerationInput(
      mockProject(),
      mockChapter(),
      mockAiCall,
    );

    expect(input.referenceText).toContain('Knowledge base excerpt');
    expect(input.generationMode).toBe('material-driven');
    expect(input.resolvedTemplate.record.id).toBeTruthy();
    expect(input.resolvedTemplate.source).toBe('builtin');
    expect(input.missingTemplateIds).toEqual([]);
  });

  it('uses requirement-driven when enrichment yields no reference text', async () => {
    vi.mocked(resolveKnowledgeMountContext).mockResolvedValue({
      referenceText: '',
      missingNodeIds: [],
      unsupported: [],
    });
    vi.mocked(readChapterReferenceText).mockResolvedValue('');

    const input = await prepareChapterGenerationInput(
      mockProject(),
      mockChapter({ knowledgeNodeIds: [] }),
      mockAiCall,
    );

    expect(input.referenceText).toBeUndefined();
    expect(input.generationMode).toBe('requirement-driven');
  });

  it('respects explicit chapter generationMode override', async () => {
    const input = await prepareChapterGenerationInput(
      mockProject(),
      mockChapter({ generationMode: 'hybrid' }),
      mockAiCall,
    );

    expect(input.generationMode).toBe('hybrid');
  });
});
