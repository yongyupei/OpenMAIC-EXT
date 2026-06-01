/**
 * @extends-from tests/teacher/chapter-knowledge-mount.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, test } from 'vitest';

import { resolveChapterKnowledgeNodeIds } from '@/lib/teacher/chapter-knowledge-mount';
import type { CourseChapter, CourseProject } from '@/lib/teacher/course-types';

function project(overrides: Partial<CourseProject> = {}): CourseProject {
  return {
    id: 'p1',
    title: 'Course',
    requirements: { requirement: 'req' },
    chapterCount: 1,
    workflowTemplateId: 'standard-course',
    status: 'draft',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
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

describe('resolveChapterKnowledgeNodeIds', () => {
  test('merges course mount and chapter mount', () => {
    const ids = resolveChapterKnowledgeNodeIds(
      project({
        knowledge: {
          mount: { nodeIds: ['course-a', 'course-b'] },
        },
      }),
      chapter({ knowledgeNodeIds: ['chapter-x'] }),
    );
    expect(ids.sort()).toEqual(['chapter-x', 'course-a', 'course-b']);
  });

  test('applies chapter exclusions on course mount', () => {
    const ids = resolveChapterKnowledgeNodeIds(
      project({
        knowledge: {
          mount: { nodeIds: ['course-a', 'course-b'] },
          chapterExclusions: { ch1: ['course-b'] },
        },
      }),
      chapter({ id: 'ch1', knowledgeNodeIds: ['chapter-x'] }),
    );
    expect(ids.sort()).toEqual(['chapter-x', 'course-a']);
  });

  test('dedupes overlapping ids', () => {
    const ids = resolveChapterKnowledgeNodeIds(
      project({
        knowledge: { mount: { nodeIds: ['shared'] } },
      }),
      chapter({ knowledgeNodeIds: ['shared', 'local'] }),
    );
    expect(ids.sort()).toEqual(['local', 'shared']);
  });
});
