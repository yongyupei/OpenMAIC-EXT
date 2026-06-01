/**
 * @extends-from tests/teacher/preview-helpers.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, test } from 'vitest';
import {
  buildChapterHints,
  buildRequirementsFromProject,
  buildChapterStructureText,
} from '@/lib/teacher/preview-helpers';
import type { CourseChapter, CourseProject } from '@/lib/teacher/course-types';
import type { SceneOutline } from '@/lib/types/generation';

const makeChapter = (overrides: Partial<CourseChapter> = {}): CourseChapter => ({
  id: 'ch1',
  title: 'JS 基础',
  learningObjectives: ['理解变量', '掌握数据类型'],
  sceneOutlines: [],
  status: 'draft',
  dirty: false,
  locked: false,
  order: 1,
  ...overrides,
});

describe('buildChapterHints', () => {
  test('converts chapters with empty sceneOutlines → targetSceneCount=3', () => {
    const hints = buildChapterHints([makeChapter()]);
    expect(hints).toEqual([
      {
        title: 'JS 基础',
        learningObjectives: ['理解变量', '掌握数据类型'],
        summary: undefined,
        targetSceneCount: 3,
      },
    ]);
  });

  test('uses sceneOutlines.length when present', () => {
    const chapter = makeChapter({
      sceneOutlines: [
        { id: 's1', title: 'S1', type: 'slide', order: 1 },
        { id: 's2', title: 'S2', type: 'quiz', order: 2 },
      ] as SceneOutline[],
    });
    const hints = buildChapterHints([chapter]);
    expect(hints[0].targetSceneCount).toBe(2);
  });

  test('includes summary when present', () => {
    const hints = buildChapterHints([makeChapter({ summary: '本章概述' })]);
    expect(hints[0].summary).toBe('本章概述');
  });
});

describe('buildRequirementsFromProject', () => {
  const base = {
    id: 'p1',
    title: '入门课',
    requirements: { requirement: '学 JS' },
    status: 'draft',
    artifacts: [],
    chapterCount: 1,
    workflowTemplateId: 'standard-course',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  } as unknown as CourseProject;

  test('uses overview when present', () => {
    const r = buildRequirementsFromProject({ ...base, overview: '课程概述' });
    expect(r.requirement).toContain('课程概述');
  });

  test('falls back to requirements.requirement when no overview', () => {
    const r = buildRequirementsFromProject(base);
    expect(r.requirement).toContain('学 JS');
  });

  test('appends targetAudience when present', () => {
    const r = buildRequirementsFromProject({ ...base, targetAudience: '初学者' });
    expect(r.requirement).toContain('初学者');
  });

  test('appends durationMinutes when present', () => {
    const r = buildRequirementsFromProject({ ...base, durationMinutes: 90 });
    expect(r.requirement).toContain('90');
  });
});

describe('buildChapterStructureText', () => {
  test('generates formatted text block for one chapter', () => {
    const text = buildChapterStructureText([
      { title: '变量', learningObjectives: ['理解变量'], targetSceneCount: 2 },
    ]);
    expect(text).toContain('变量');
    expect(text).toContain('理解变量');
    expect(text).toContain('2');
  });

  test('returns empty string for empty array', () => {
    expect(buildChapterStructureText([])).toBe('');
  });
});
