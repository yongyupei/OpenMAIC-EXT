/**
 * @extends-from tests/teacher/project-list-summary.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, test } from 'vitest';

import type { CourseProject } from '@/lib/teacher/course-types';
import { toTeacherProjectListItem } from '@/lib/teacher/project-list-summary';

const baseProject: CourseProject = {
  id: 'p1',
  title: 'Biology 101',
  requirements: { requirement: 'intro biology' },
  chapterCount: 2,
  workflowTemplateId: 'standard-course',
  status: 'draft',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  artifacts: [],
  designWorkbenchChat: {
    messages: [{ id: 'm1', role: 'user', content: 'hello' }],
    updatedAt: '2026-01-02T00:00:00.000Z',
  },
  outline: {
    projectId: 'p1',
    revision: 1,
    chapters: [
      {
        id: 'ch1',
        title: 'Cells',
        learningObjectives: ['a'],
        sceneOutlines: [],
        status: 'draft',
        dirty: false,
        locked: false,
        order: 0,
      },
    ],
  },
};

describe('toTeacherProjectListItem', () => {
  test('omits chat transcript but exposes hasDesignChat', () => {
    const item = toTeacherProjectListItem(baseProject);
    expect(item.id).toBe('p1');
    expect(item.title).toBe('Biology 101');
    expect(item.hasDesignChat).toBe(true);
    expect('designWorkbenchChat' in item).toBe(false);
    expect('outline' in item).toBe(false);
  });
});
