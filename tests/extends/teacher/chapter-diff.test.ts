/**
 * @extends-from tests/teacher/chapter-diff.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, test } from 'vitest';
import { applyChapterPatches, type ChapterPatch } from '@/lib/teacher/chapter-diff';
import type { CourseChapter } from '@/lib/teacher/course-types';

function chapter(
  overrides: Partial<CourseChapter> & Pick<CourseChapter, 'id' | 'title'>,
): CourseChapter {
  return {
    learningObjectives: [],
    sceneOutlines: [],
    status: 'draft',
    dirty: false,
    locked: false,
    order: 0,
    summary: '',
    ...overrides,
  };
}

describe('applyChapterPatches', () => {
  test('returns existing chapter unchanged when no patches change content', () => {
    const existing = [chapter({ id: 'a', title: 'A', order: 0 })];
    const patches: ChapterPatch[] = [{ id: 'a', title: 'A', learningObjectives: [], summary: '' }];
    const result = applyChapterPatches(existing, patches);
    expect(result.chapters[0]).toMatchObject(existing[0]!);
    expect(result.chapters[0].deepSearchEnabled).toBe(false);
    expect(result.idMapping).toEqual({});
    expect(result.deletedIds).toEqual([]);
  });

  test('inserts new chapter for local-/ai- prefixed id and assigns nanoid', () => {
    const existing: CourseChapter[] = [];
    const patches: ChapterPatch[] = [
      { id: 'local-temp-1', title: 'New', learningObjectives: ['L1'], summary: 'S' },
    ];
    const result = applyChapterPatches(existing, patches);
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0].id).not.toBe('local-temp-1');
    expect(result.chapters[0].id.length).toBeGreaterThanOrEqual(8);
    expect(result.idMapping['local-temp-1']).toBe(result.chapters[0].id);
  });

  test('marks ready chapter as dirty when title changes', () => {
    const existing = [chapter({ id: 'a', title: 'Old', status: 'ready', order: 0 })];
    const patches: ChapterPatch[] = [
      { id: 'a', title: 'New', learningObjectives: [], summary: '' },
    ];
    const result = applyChapterPatches(existing, patches);
    expect(result.chapters[0].status).toBe('dirty');
    expect(result.chapters[0].dirty).toBe(true);
  });

  test('does NOT dirty when chapter is draft (no scenes yet)', () => {
    const existing = [chapter({ id: 'a', title: 'Old', status: 'draft', order: 0 })];
    const patches: ChapterPatch[] = [
      { id: 'a', title: 'New', learningObjectives: [], summary: '' },
    ];
    const result = applyChapterPatches(existing, patches);
    expect(result.chapters[0].status).toBe('draft');
    expect(result.chapters[0].dirty).toBe(false);
  });

  test('deletes chapter missing from snapshot and reports id', () => {
    const existing = [
      chapter({ id: 'a', title: 'A', order: 0 }),
      chapter({ id: 'b', title: 'B', order: 1 }),
    ];
    const patches: ChapterPatch[] = [{ id: 'a', title: 'A', learningObjectives: [], summary: '' }];
    const result = applyChapterPatches(existing, patches);
    expect(result.chapters.map((c) => c.id)).toEqual(['a']);
    expect(result.deletedIds).toEqual(['b']);
  });

  test('marks ready chapter as dirty when knowledgeNodeIds change', () => {
    const existing = [
      chapter({
        id: 'a',
        title: 'A',
        status: 'ready',
        order: 0,
        knowledgeNodeIds: ['kb-1'],
      }),
    ];
    const patches: ChapterPatch[] = [
      {
        id: 'a',
        title: 'A',
        learningObjectives: [],
        summary: '',
        knowledgeNodeIds: ['kb-1', 'kb-2'],
      },
    ];
    const result = applyChapterPatches(existing, patches);
    expect(result.chapters[0].status).toBe('dirty');
    expect(result.chapters[0].knowledgeNodeIds).toEqual(['kb-1', 'kb-2']);
  });

  test('marks ready chapter as dirty when generationMode changes', () => {
    const existing = [
      chapter({
        id: 'a',
        title: 'A',
        status: 'ready',
        order: 0,
        generationMode: 'requirement-driven',
      }),
    ];
    const patches: ChapterPatch[] = [
      {
        id: 'a',
        title: 'A',
        learningObjectives: [],
        summary: '',
        generationMode: 'material-driven',
      },
    ];
    const result = applyChapterPatches(existing, patches);
    expect(result.chapters[0].status).toBe('dirty');
    expect(result.chapters[0].generationMode).toBe('material-driven');
  });

  test('preserves order from snapshot (reorder semantics)', () => {
    const existing = [
      chapter({ id: 'a', title: 'A', order: 0 }),
      chapter({ id: 'b', title: 'B', order: 1 }),
    ];
    const patches: ChapterPatch[] = [
      { id: 'b', title: 'B', learningObjectives: [], summary: '' },
      { id: 'a', title: 'A', learningObjectives: [], summary: '' },
    ];
    const result = applyChapterPatches(existing, patches);
    expect(result.chapters.map((c) => c.id)).toEqual(['b', 'a']);
    expect(result.chapters.map((c) => c.order)).toEqual([0, 1]);
  });
});
