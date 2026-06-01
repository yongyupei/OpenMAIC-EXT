/**
 * @extends-from tests/teacher/chapter-classroom-types.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, test } from 'vitest';
import { buildChapterGeneratePath, buildChapterStudioPath } from '@/lib/teacher/routes';

describe('chapter classroom route builders', () => {
  test('buildChapterGeneratePath returns correct path', () => {
    expect(buildChapterGeneratePath('proj-1', 'ch-1')).toBe(
      '/teacher/projects/proj-1/chapters/ch-1/generate',
    );
  });

  test('buildChapterStudioPath returns correct path', () => {
    expect(buildChapterStudioPath('proj-1', 'ch-1')).toBe(
      '/teacher/projects/proj-1/chapters/ch-1/studio',
    );
  });

  test('buildChapterGeneratePath URL-encodes special characters', () => {
    expect(buildChapterGeneratePath('p r o j', 'c h')).toBe(
      '/teacher/projects/p%20r%20o%20j/chapters/c%20h/generate',
    );
  });
});
