/**
 * @extends-from tests/server/classroom-storage-update.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, test, vi } from 'vitest';
import type { Scene, Stage } from '@/lib/types/stage';

vi.mock('fs', () => ({
  promises: {
    mkdir: vi.fn(async () => undefined),
    writeFile: vi.fn(async () => undefined),
    rename: vi.fn(async () => undefined),
    readFile: vi.fn(async () =>
      JSON.stringify({
        id: 'course-1',
        stage: buildStage(1),
        scenes: [buildScene('s1', 0)],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        revision: 1,
      }),
    ),
  },
}));

import { updateClassroom } from '@/lib/server/classroom-storage';

function buildStage(revision: number): Stage {
  return {
    id: 'course-1',
    name: `Course ${revision}`,
    createdAt: 1,
    updatedAt: revision,
  };
}

function buildScene(id: string, order: number): Scene {
  return {
    id,
    stageId: 'course-1',
    type: 'quiz',
    title: id,
    order,
    content: { type: 'quiz', questions: [] },
  };
}

describe('updateClassroom', () => {
  test('preserves createdAt and increments revision when saving edited classroom data', async () => {
    const result = await updateClassroom(
      {
        id: 'course-1',
        stage: buildStage(2),
        scenes: [buildScene('s2', 0)],
      },
      'http://localhost:3000',
    );

    expect(result.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(result.revision).toBe(2);
    expect(result.updatedAt).not.toBe(result.createdAt);
    expect(result.url).toBe('http://localhost:3000/classroom/course-1');
    expect(result.stage.name).toBe('Course 2');
  });
});
