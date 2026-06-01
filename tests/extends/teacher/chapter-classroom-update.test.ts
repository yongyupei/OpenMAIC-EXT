/**
 * @extends-from tests/teacher/chapter-classroom-update.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, test } from 'vitest';
import { applyChapterClassroomUpdate } from '@/lib/teacher/course-project';
import type { CourseChapterClassroom, CourseProject } from '@/lib/teacher/course-types';

function makeProject(overrides: Partial<CourseProject> = {}): CourseProject {
  return {
    id: 'proj-1',
    title: 'Test Course',
    requirements: { requirement: 'Test requirement' },
    chapterCount: 2,
    workflowTemplateId: 'standard-course',
    status: 'editing',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    artifacts: [],
    ...overrides,
  };
}

const classroom: CourseChapterClassroom = {
  chapterId: 'ch-1',
  classroomId: 'proj-1-ch-ch-1',
  status: 'ready',
  sceneCount: 5,
  createdAt: '2026-05-16T00:00:00.000Z',
  updatedAt: '2026-05-16T00:00:00.000Z',
};

describe('applyChapterClassroomUpdate', () => {
  test('sets chapterClassrooms when previously absent', () => {
    const updated = applyChapterClassroomUpdate(makeProject(), classroom);
    expect(updated.chapterClassrooms?.['ch-1']).toEqual(classroom);
  });

  test('merges with existing sibling classrooms', () => {
    const sibling: CourseChapterClassroom = {
      ...classroom,
      chapterId: 'ch-2',
      classroomId: 'proj-1-ch-ch-2',
    };
    const project = makeProject({ chapterClassrooms: { 'ch-2': sibling } });
    const updated = applyChapterClassroomUpdate(project, classroom);
    expect(updated.chapterClassrooms?.['ch-1']).toEqual(classroom);
    expect(updated.chapterClassrooms?.['ch-2']).toEqual(sibling);
  });

  test('overwrites existing entry for the same chapterId', () => {
    const old: CourseChapterClassroom = { ...classroom, status: 'generating' };
    const project = makeProject({ chapterClassrooms: { 'ch-1': old } });
    const updated = applyChapterClassroomUpdate(project, classroom);
    expect(updated.chapterClassrooms?.['ch-1'].status).toBe('ready');
  });

  test('does not mutate the original project', () => {
    const project = makeProject();
    applyChapterClassroomUpdate(project, classroom);
    expect(project.chapterClassrooms).toBeUndefined();
  });

  test('transitions project status to editing when chapter becomes ready and project was outlining', () => {
    const project = makeProject({ status: 'outlining' });
    const updated = applyChapterClassroomUpdate(project, { ...classroom, status: 'ready' });
    expect(updated.status).toBe('editing');
  });

  test('does not change project status when chapter is only generating', () => {
    const project = makeProject({ status: 'outlining' });
    const updated = applyChapterClassroomUpdate(project, { ...classroom, status: 'generating' });
    expect(updated.status).toBe('outlining');
  });

  test('transitions project status to editing when chapter becomes ready and project was draft', () => {
    const project = makeProject({ status: 'draft' });
    const updated = applyChapterClassroomUpdate(project, { ...classroom, status: 'ready' });
    expect(updated.status).toBe('editing');
  });
});
