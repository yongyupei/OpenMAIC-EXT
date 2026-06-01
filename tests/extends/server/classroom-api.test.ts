/**
 * @extends-from tests/server/classroom-api.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Scene, Stage } from '@/lib/types/stage';

const { updateClassroomMock } = vi.hoisted(() => ({
  updateClassroomMock: vi.fn(async () => ({
    id: 'chapter-classroom-1',
    stage: {
      id: 'chapter-classroom-1',
      name: 'Chapter studio',
      createdAt: 1,
      updatedAt: 2,
    },
    scenes: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    revision: 2,
    url: 'http://localhost:3000/classroom/chapter-classroom-1',
  })),
}));

vi.mock('@/lib/server/classroom-storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/classroom-storage')>();
  return {
    ...actual,
    updateClassroom: updateClassroomMock,
  };
});

import { PUT } from '@app-extends/api/classroom/route';

function buildStage(): Stage {
  return {
    id: 'chapter-classroom-1',
    name: 'Chapter studio',
    createdAt: 1,
    updatedAt: 2,
  };
}

function buildScene(id: string, order: number): Scene {
  return {
    id,
    stageId: 'chapter-classroom-1',
    type: 'quiz',
    title: id,
    order,
    content: { type: 'quiz', questions: [] },
  };
}

describe('classroom PUT API', () => {
  beforeEach(() => {
    updateClassroomMock.mockClear();
  });

  test('persists edited classroom payload via updateClassroom', async () => {
    const stage = buildStage();
    const scenes = [buildScene('s1', 0)];
    const request = new NextRequest('http://localhost/api/extends/classroom', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: stage.id, stage, scenes }),
    });

    const response = await PUT(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.revision).toBe(2);
    expect(updateClassroomMock).toHaveBeenCalledWith(
      { id: stage.id, stage, scenes },
      'http://localhost',
    );
  });

  test('rejects payload when stage id does not match classroom id', async () => {
    const request = new NextRequest('http://localhost/api/extends/classroom', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'chapter-classroom-1',
        stage: { ...buildStage(), id: 'other-id' },
        scenes: [buildScene('s1', 0)],
      }),
    });

    const response = await PUT(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(updateClassroomMock).not.toHaveBeenCalled();
  });
});
