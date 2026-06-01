/**
 * @extends-from tests/course-editor/course-editor/scene-operations.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, test } from 'vitest';
import type { Scene } from '@/lib/types/stage';
import {
  duplicateScene,
  moveScene,
  updateQuizQuestion,
} from '@/lib/course-editor/scene-operations';

function scene(id: string, order: number, title = id): Scene {
  return {
    id,
    stageId: 'stage-1',
    type: 'quiz',
    title,
    order,
    content: {
      type: 'quiz',
      questions: [
        {
          id: `${id}-q1`,
          type: 'single',
          question: 'Original?',
          options: [{ label: 'A', value: 'A' }],
          answer: ['A'],
        },
      ],
    },
  };
}

describe('course editor scene operations', () => {
  test('moves a scene and normalizes scene order', () => {
    const result = moveScene([scene('a', 0), scene('b', 1), scene('c', 2)], 'c', 0);

    expect(result.map((s) => s.id)).toEqual(['c', 'a', 'b']);
    expect(result.map((s) => s.order)).toEqual([0, 1, 2]);
  });

  test('duplicates a scene after the source with a fresh id and normalized order', () => {
    const result = duplicateScene([scene('a', 0), scene('b', 1)], 'a', () => 'copy-id');

    expect(result.map((s) => s.id)).toEqual(['a', 'copy-id', 'b']);
    expect(result.map((s) => s.order)).toEqual([0, 1, 2]);
    expect(result[1]).toMatchObject({
      id: 'copy-id',
      stageId: 'stage-1',
      title: 'a Copy',
    });
    expect(result[1].content).not.toBe(result[0].content);
  });

  test('updates a quiz question without changing other questions', () => {
    const [input] = [scene('quiz', 0)];
    const result = updateQuizQuestion(input, 'quiz-q1', {
      question: 'Updated?',
      answer: ['B'],
    });

    expect(result.content).toMatchObject({
      type: 'quiz',
      questions: [
        {
          id: 'quiz-q1',
          question: 'Updated?',
          answer: ['B'],
        },
      ],
    });
  });
});
