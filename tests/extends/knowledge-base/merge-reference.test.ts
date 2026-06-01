/**
 * @extends-from tests/knowledge-base/merge-reference.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, test } from 'vitest';
import { mergeReferenceSources } from '@/lib/knowledge-base/merge-reference';

describe('mergeReferenceSources', () => {
  test('concatenates kb and chapter with separator', () => {
    const out = mergeReferenceSources('KB text', 'Chapter text');
    expect(out).toContain('KB text');
    expect(out).toContain('Chapter text');
    expect(out).toBe('KB text\n\n---\n\nChapter text');
  });

  test('truncates to max chars', () => {
    const long = 'a'.repeat(10_000);
    const out = mergeReferenceSources(long, undefined, 100);
    expect(out.length).toBeLessThanOrEqual(103);
    expect(out.endsWith('\n…')).toBe(true);
    expect(out.slice(0, 100)).toBe('a'.repeat(100));
  });

  test('dedupes identical blocks', () => {
    const out = mergeReferenceSources('same', 'same');
    expect(out.match(/same/g)?.length).toBe(1);
    expect(out).toBe('same');
  });
});
