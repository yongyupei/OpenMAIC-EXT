/**
 * @extends-from tests/teacher/chapter-outline-edits.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';

const storageState = vi.hoisted(() => ({
  reads: [] as string[],
  writes: [] as unknown[],
  fakeProject: null as unknown,
}));

vi.mock('@/lib/teacher/course-project-storage', () => ({
  readTeacherProject: vi.fn(async (id: string) => {
    storageState.reads.push(id);
    return storageState.fakeProject;
  }),
  writeTeacherProject: vi.fn(async (project: unknown) => {
    storageState.writes.push(project);
    return project;
  }),
}));

import {
  parseSceneOutlinesFromBody,
  persistChapterSceneOutlines,
} from '@/lib/extends/teacher/chapter-outline-edits';

beforeEach(() => {
  storageState.reads = [];
  storageState.writes = [];
  storageState.fakeProject = null;
});

describe('parseSceneOutlinesFromBody', () => {
  test('returns null for missing or empty input', () => {
    expect(parseSceneOutlinesFromBody(undefined)).toBeNull();
    expect(parseSceneOutlinesFromBody(null)).toBeNull();
    expect(parseSceneOutlinesFromBody([])).toBeNull();
  });

  test('keeps only entries with id + non-empty title', () => {
    const outlines = parseSceneOutlinesFromBody([
      { id: 'o-1', type: 'slide', title: 'Keep me', description: 'd', keyPoints: ['a'] },
      { id: '', type: 'slide', title: 'Drop me — no id' },
      { id: 'o-3', type: 'slide', title: '   ' },
      { id: 'o-4', type: 'quiz', title: 'Quiz' },
    ]);
    expect(outlines?.map((o) => o.id)).toEqual(['o-1', 'o-4']);
  });

  test('falls back to slide for unknown scene types', () => {
    const outlines = parseSceneOutlinesFromBody([
      { id: 'o-1', type: 'video', title: 'Strange' },
      { id: 'o-2', type: 'pbl', title: 'Project' },
    ]);
    expect(outlines?.[0].type).toBe('slide');
    expect(outlines?.[1].type).toBe('pbl');
  });

  test('normalizes keyPoints to strings', () => {
    const outlines = parseSceneOutlinesFromBody([
      { id: 'o-1', type: 'slide', title: 't', keyPoints: ['ok', 42, null, 'fine'] },
    ]);
    expect(outlines?.[0].keyPoints).toEqual(['ok', 'fine']);
  });
});

describe('persistChapterSceneOutlines', () => {
  test('writes the edited outlines onto the matching chapter and re-numbers orders', async () => {
    storageState.fakeProject = {
      id: 'p-1',
      outline: {
        chapters: [
          { id: 'c-other', title: 'Other', sceneOutlines: [{ id: 'x', order: 7 }] },
          { id: 'c-1', title: 'Target', sceneOutlines: [{ id: 'old', order: 0 }] },
        ],
      },
      updatedAt: '2026-05-01T00:00:00.000Z',
    };

    await persistChapterSceneOutlines('p-1', 'c-1', [
      {
        id: 'o-1',
        type: 'slide',
        title: 'A',
        description: '',
        keyPoints: [],
        order: 9,
      },
      {
        id: 'o-2',
        type: 'quiz',
        title: 'B',
        description: '',
        keyPoints: [],
        order: 9,
      },
    ]);

    expect(storageState.writes).toHaveLength(1);
    const written = storageState.writes[0] as {
      outline: {
        chapters: Array<{
          id: string;
          sceneOutlines?: Array<{ id: string; order: number }>;
        }>;
      };
      updatedAt: string;
    };
    const targetChapter = written.outline.chapters.find((c) => c.id === 'c-1');
    expect(targetChapter?.sceneOutlines?.map((o) => `${o.id}@${o.order}`)).toEqual([
      'o-1@0',
      'o-2@1',
    ]);
    const otherChapter = written.outline.chapters.find((c) => c.id === 'c-other');
    expect(otherChapter?.sceneOutlines).toEqual([{ id: 'x', order: 7 }]);
    expect(written.updatedAt).not.toBe('2026-05-01T00:00:00.000Z');
  });

  test('no-ops when project or outline is missing', async () => {
    storageState.fakeProject = null;
    await persistChapterSceneOutlines('missing', 'c-1', [
      {
        id: 'o-1',
        type: 'slide',
        title: 'A',
        description: '',
        keyPoints: [],
        order: 0,
      },
    ]);
    expect(storageState.writes).toHaveLength(0);

    storageState.fakeProject = { id: 'p-1' };
    await persistChapterSceneOutlines('p-1', 'c-1', [
      {
        id: 'o-1',
        type: 'slide',
        title: 'A',
        description: '',
        keyPoints: [],
        order: 0,
      },
    ]);
    expect(storageState.writes).toHaveLength(0);
  });
});
