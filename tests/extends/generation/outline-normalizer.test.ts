import { describe, expect, it } from 'vitest';

import {
  normalizeSlideOutlineForGeneration,
  SLIDE_KEY_POINT_MAX_CHARS,
  SLIDE_KEY_POINTS_MAX,
  trimSlideKeyPoint,
} from '@/lib/extends/generation/outline-normalizer';
import type { SceneOutline } from '@/lib/types/generation';

function slideOutline(overrides: Partial<SceneOutline> = {}): SceneOutline {
  return {
    id: 's1',
    type: 'slide',
    title: 'Intro',
    description: 'Purpose',
    keyPoints: ['A', 'B', 'C'],
    order: 1,
    ...overrides,
  };
}

describe('outline-normalizer', () => {
  it('trimSlideKeyPoint truncates long phrases', () => {
    const long = 'word '.repeat(30).trim();
    expect(trimSlideKeyPoint(long).length).toBeLessThanOrEqual(SLIDE_KEY_POINT_MAX_CHARS);
    expect(trimSlideKeyPoint(long).endsWith('…')).toBe(true);
  });

  it('normalizeSlideOutlineForGeneration caps keyPoints count and length', () => {
    const normalized = normalizeSlideOutlineForGeneration(
      slideOutline({
        keyPoints: Array.from({ length: 8 }, (_, i) => `Point ${i} `.repeat(10).trim()),
        visualHint: 'title-bar + two-column compare with chart on the right side for metrics',
      }),
    );

    expect(normalized.keyPoints!.length).toBeLessThanOrEqual(SLIDE_KEY_POINTS_MAX);
    for (const point of normalized.keyPoints ?? []) {
      expect(point.length).toBeLessThanOrEqual(SLIDE_KEY_POINT_MAX_CHARS);
    }
    expect(normalized.visualHint!.length).toBeLessThanOrEqual(120);
  });

  it('leaves non-slide outlines unchanged', () => {
    const quiz: SceneOutline = {
      id: 'q1',
      type: 'quiz',
      title: 'Quiz',
      description: 'Check',
      keyPoints: ['One very long key point '.repeat(20)],
      order: 2,
    };
    expect(normalizeSlideOutlineForGeneration(quiz)).toEqual(quiz);
  });
});
