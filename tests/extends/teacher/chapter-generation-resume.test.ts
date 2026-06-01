/**
 * @extends-from tests/teacher/chapter-generation-resume.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, it } from 'vitest';
import {
  chapterForFullRegenerate,
  getSceneGenerationStartIndex,
  shouldResumeChapterGeneration,
} from '@/lib/teacher/chapter-generation-resume';
import type { CourseChapter, CourseChapterClassroom } from '@/lib/teacher/course-types';

const failedClassroom: CourseChapterClassroom = {
  chapterId: 'ch-1',
  classroomId: 'p-ch-ch-1',
  status: 'failed',
  failedReason: 'API error',
  failedStep: 'scenes',
  sceneCount: 2,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('shouldResumeChapterGeneration', () => {
  it('resumes when previous status is failed', () => {
    expect(shouldResumeChapterGeneration(failedClassroom, {})).toBe(true);
  });

  it('resumes when resume flag is set', () => {
    expect(shouldResumeChapterGeneration(undefined, { resume: true })).toBe(true);
  });

  it('does not resume when regenerate is requested', () => {
    expect(shouldResumeChapterGeneration(failedClassroom, { regenerate: true })).toBe(false);
  });
});

describe('getSceneGenerationStartIndex', () => {
  it('continues after existing scenes', () => {
    expect(getSceneGenerationStartIndex([{ id: 's1' }, { id: 's2' }] as never[], false)).toBe(2);
  });

  it('starts from zero when regenerating', () => {
    expect(getSceneGenerationStartIndex([{ id: 's1' }] as never[], true)).toBe(0);
  });
});

describe('chapterForFullRegenerate', () => {
  const chapter = {
    id: 'ch-1',
    title: 'Chapter',
    learningObjectives: ['obj'],
    sceneOutlines: [{ id: 'scene_1', type: 'slide', title: 'S1', order: 0 }],
    status: 'draft',
    dirty: false,
    locked: false,
    order: 0,
  } as CourseChapter;

  it('clears outlines when regenerating', () => {
    expect(chapterForFullRegenerate(chapter, true).sceneOutlines).toEqual([]);
  });

  it('keeps outlines otherwise', () => {
    expect(chapterForFullRegenerate(chapter, false).sceneOutlines).toHaveLength(1);
  });
});
