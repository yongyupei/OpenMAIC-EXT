/**
 * @extends-from tests/teacher/chapter-reference-material.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, test } from 'vitest';

import { buildMaterialFirstChapterInstruction } from '@/lib/teacher/chapter-generation-input';
import { chapterHasAttachedReferenceSources } from '@/lib/teacher/chapter-reference-material';
import type { CourseChapter, CourseProject } from '@/lib/teacher/course-types';

function project(overrides: Partial<CourseProject> = {}): CourseProject {
  return {
    id: 'p1',
    title: 'Course',
    requirements: { requirement: 'req' },
    chapterCount: 1,
    workflowTemplateId: 'standard-course',
    status: 'draft',
    createdAt: '',
    updatedAt: '',
    artifacts: [],
    ...overrides,
  };
}

function chapter(overrides: Partial<CourseChapter> = {}): CourseChapter {
  return {
    id: 'ch1',
    title: 'Chapter',
    learningObjectives: [],
    sceneOutlines: [],
    status: 'draft',
    dirty: false,
    locked: false,
    order: 0,
    ...overrides,
  };
}

describe('chapterHasAttachedReferenceSources', () => {
  test('detects attached KB or uploads', () => {
    expect(chapterHasAttachedReferenceSources(project(), chapter())).toBe(false);
    expect(chapterHasAttachedReferenceSources(project(), chapter({ knowledgeNodeIds: ['n1'] }))).toBe(
      true,
    );
    expect(
      chapterHasAttachedReferenceSources(
        project(),
        chapter({
          referenceFiles: [
            {
              id: 'f1',
              name: 'a.pdf',
              mimeType: 'application/pdf',
              size: 1,
              uploadedAt: '',
            },
          ],
        }),
      ),
    ).toBe(true);
  });
});

describe('buildMaterialFirstChapterInstruction', () => {
  test('returns material-first block when reference text exists', () => {
    const text = buildMaterialFirstChapterInstruction('material-driven', 'Section 1\nContent');
    expect(text).toContain('Material-first');
    expect(text).toContain('PRIMARY source');
  });

  test('returns empty for requirement-driven even with reference', () => {
    expect(buildMaterialFirstChapterInstruction('requirement-driven', 'doc')).toBe('');
  });
});
