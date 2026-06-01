/**
 * @extends-from tests/teacher/chapter-generation-input.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, it } from 'vitest';

import {
  buildChapterDesignBrief,
  buildChapterRequirement,
  buildChapterSceneSearchRequirement,
  buildChapterSlideVisualBrief,
  buildChapterTeacherContext,
} from '@/lib/teacher/chapter-generation-input';
import type { CourseChapter, CourseProject } from '@/lib/teacher/course-types';

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
    learningObjectives: ['Explain perceptrons', 'Compare activation functions'],
    sceneOutlines: [],
    status: 'draft',
    dirty: false,
    locked: false,
    order: 0,
    summary: 'Foundations of neural nets',
    deepSearchEnabled: true,
    referenceFiles: [
      { id: 'f1', name: 'notes.pdf', mimeType: 'application/pdf', size: 100, uploadedAt: '' },
    ],
    ...overrides,
  };
}

describe('chapter-generation-input', () => {
  it('buildChapterRequirement includes title, summary, objectives, and course context', () => {
    const text = buildChapterRequirement(mockProject(), mockChapter());
    expect(text).toContain('Neural Networks');
    expect(text).toContain('Foundations of neural nets');
    expect(text).toContain('Explain perceptrons');
    expect(text).toContain('Intro to AI');
    expect(text).toContain('THIS chapter only');
  });

  it('buildChapterTeacherContext includes reference files and deep search', () => {
    const text = buildChapterTeacherContext(mockProject(), mockChapter());
    expect(text).toContain('notes.pdf');
    expect(text).toContain('Deep search is enabled');
  });

  it('buildChapterDesignBrief includes reference excerpts when provided', () => {
    const text = buildChapterDesignBrief(mockProject(), mockChapter(), 'PDF excerpt content');
    expect(text).toContain('PDF excerpt content');
    expect(text).toContain('Learning objectives');
  });

  it('buildChapterDesignBrief includes scene web search when provided', () => {
    const text = buildChapterDesignBrief(
      mockProject(),
      mockChapter(),
      undefined,
      'Latest 2026 findings on neural nets',
    );
    expect(text).toContain('Web search (scene generation)');
    expect(text).toContain('Latest 2026 findings');
  });

  it('buildChapterSlideVisualBrief omits reference excerpts and web search', () => {
    const longReference = 'PDF excerpt '.repeat(500);
    const fullBrief = buildChapterDesignBrief(
      mockProject(),
      mockChapter(),
      longReference,
      'Web search hits',
    );
    const visualBrief = buildChapterSlideVisualBrief(mockProject(), mockChapter());

    expect(fullBrief).toContain('PDF excerpt');
    expect(fullBrief).toContain('Web search (scene generation)');
    expect(visualBrief).not.toContain('PDF excerpt');
    expect(visualBrief).not.toContain('Web search');
    expect(visualBrief).toContain('Neural Networks');
    expect(visualBrief).toContain('Explain perceptrons');
    expect(visualBrief).toContain('Office-style');
  });

  it('buildChapterSceneSearchRequirement lists planned scenes', () => {
    const chapter = mockChapter({
      sceneOutlines: [
        {
          id: 'scene_1',
          type: 'slide',
          title: 'Intro',
          description: 'Overview',
          keyPoints: ['Perceptron'],
          order: 0,
        },
      ],
    });
    const text = buildChapterSceneSearchRequirement(mockProject(), chapter);
    expect(text).toContain('Planned instructional scenes');
    expect(text).toContain('[slide] Intro');
    expect(text).toContain('Perceptron');
  });
});
