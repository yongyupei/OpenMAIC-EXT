/**
 * @extends-from tests/teacher/slide-output-format.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, it } from 'vitest';

import { slideOutputFormatSchema } from '@/lib/teacher/slide-output-format';

describe('slideOutputFormatSchema', () => {
  it('defaults to canvas when omitted', () => {
    expect(slideOutputFormatSchema.parse(undefined)).toBe('canvas');
  });

  it('accepts html', () => {
    expect(slideOutputFormatSchema.parse('html')).toBe('html');
  });
});
