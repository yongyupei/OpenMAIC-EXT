/**
 * @extends-from tests/generation/html-slide-placeholder-canvas.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, it } from 'vitest';

import { buildHtmlSlidePlaceholderContent } from '@/lib/generation/html-slide-placeholder-canvas';

describe('buildHtmlSlidePlaceholderContent', () => {
  it('returns title elements for scene list thumbnail', () => {
    const content = buildHtmlSlidePlaceholderContent({
      id: 'o1',
      type: 'slide',
      title: 'Intro',
      description: 'Overview',
      keyPoints: ['A'],
      order: 1,
    });
    expect(content.elements.length).toBeGreaterThan(0);
    expect(JSON.stringify(content.elements)).toContain('Intro');
  });
});
