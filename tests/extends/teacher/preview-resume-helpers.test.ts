/**
 * @extends-from tests/teacher/preview-resume-helpers.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, test } from 'vitest';
import {
  hasIncompleteOutlines,
  localDraftLooksResumable,
  teacherPreviewEntryShouldGate,
} from '@/lib/teacher/preview-resume-helpers';
import type { SceneOutline } from '@/lib/types/generation';

const outline = (order: number, id = `o${order}`): SceneOutline =>
  ({
    id,
    title: `T${order}`,
    type: 'slide',
    order,
    description: '',
  }) as SceneOutline;

describe('hasIncompleteOutlines', () => {
  test('false when no outlines', () => {
    expect(hasIncompleteOutlines([], [{ order: 1 }])).toBe(false);
  });

  test('true when a scene order is missing', () => {
    const outlines = [outline(1), outline(2)];
    expect(hasIncompleteOutlines(outlines, [{ order: 1 }])).toBe(true);
  });

  test('false when all orders covered', () => {
    const outlines = [outline(1), outline(2)];
    expect(hasIncompleteOutlines(outlines, [{ order: 1 }, { order: 2 }])).toBe(false);
  });
});

describe('localDraftLooksResumable', () => {
  test('false when outlines empty', () => {
    expect(localDraftLooksResumable([], [], 'paused')).toBe(false);
  });

  test('true when incomplete outlines', () => {
    expect(localDraftLooksResumable([outline(1), outline(2)], [{ order: 1 }], 'generating')).toBe(
      true,
    );
  });

  test('true when paused even if scenes look complete (edge)', () => {
    expect(localDraftLooksResumable([outline(1)], [{ order: 1 }], 'paused')).toBe(true);
  });

  test('false when completed and all scenes present', () => {
    expect(localDraftLooksResumable([outline(1)], [{ order: 1 }], 'completed')).toBe(false);
  });
});

describe('teacherPreviewEntryShouldGate', () => {
  test('false when no outlines', () => {
    expect(teacherPreviewEntryShouldGate([], [{ order: 1 }], 'idle')).toBe(false);
  });

  test('true when outlines exist but scenes incomplete', () => {
    expect(teacherPreviewEntryShouldGate([outline(1), outline(2)], [{ order: 1 }], 'idle')).toBe(
      true,
    );
  });

  test('true when paused', () => {
    expect(teacherPreviewEntryShouldGate([outline(1)], [{ order: 1 }], 'paused')).toBe(true);
  });

  test('true when all outlines have scenes even if status idle (reload)', () => {
    expect(teacherPreviewEntryShouldGate([outline(1)], [{ order: 1 }], 'idle')).toBe(true);
  });
});
