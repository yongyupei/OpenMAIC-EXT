import { describe, expect, test } from 'vitest';

import { computePendingSceneOutlines } from '@/lib/extends/teacher/sync-chapter-studio-generation';
import type { SceneOutline } from '@/lib/types/generation';
import type { Scene } from '@/lib/types/stage';

function outline(order: number, id = `o-${order}`): SceneOutline {
  return {
    id,
    type: 'slide',
    title: `Scene ${order}`,
    description: '',
    keyPoints: [],
    order,
  };
}

function scene(order: number, id = `s-${order}`): Scene {
  return {
    id,
    stageId: 'classroom-1',
    type: 'slide',
    title: `Scene ${order}`,
    order,
    content: { type: 'slide', canvas: { id: 'c', viewportSize: 1000, viewportRatio: 0.5625, elements: [] } },
    actions: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('computePendingSceneOutlines', () => {
  test('returns outlines without matching completed scene orders', () => {
    const outlines = [outline(0), outline(1), outline(2)];
    const scenes = [scene(0), scene(1)];
    expect(computePendingSceneOutlines(outlines, scenes)).toEqual([outline(2)]);
  });

  test('returns empty when all outlines are materialized', () => {
    const outlines = [outline(0), outline(1)];
    const scenes = [scene(0), scene(1)];
    expect(computePendingSceneOutlines(outlines, scenes)).toEqual([]);
  });
});
