/**
 * @extends-from tests/slide-templates/build-template-preview-slide.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, it } from 'vitest';

import { OFFICE_BLUE_SLIDE_THEME } from '@/lib/slide-templates/builtins';
import { BUSINESS_NAVY_THEME } from '@/lib/slide-templates/business-builtin-themes';
import { buildTemplatePreviewSlide } from '@/lib/slide-templates/build-template-preview-slide';
import { SHARED_BUILTIN_LAYOUTS } from '@/lib/slide-templates/shared-layouts';

describe('buildTemplatePreviewSlide', () => {
  it('builds upstream-format preview with text only for default template', () => {
    const slide = buildTemplatePreviewSlide(
      {
        id: 'builtin:default-professional',
        name: 'Default professional',
        scope: 'builtin',
        theme: OFFICE_BLUE_SLIDE_THEME,
        layouts: SHARED_BUILTIN_LAYOUTS,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        bullet1: 'A',
        bullet2: 'B',
        bullet3: 'C',
        blocksLabel: 'Blocks',
      },
    );

    expect(slide.background?.type).toBe('solid');
    expect(slide.elements.every((el) => el.type === 'text')).toBe(true);
    expect(slide.elements.filter((el) => el.type === 'shape')).toHaveLength(0);
  });

  it('adds accent block shapes and larger type on dark business templates', () => {
    const slide = buildTemplatePreviewSlide(
      {
        id: 'builtin:theme-business-navy',
        name: '深蓝商务',
        scope: 'builtin',
        theme: BUSINESS_NAVY_THEME,
        layouts: SHARED_BUILTIN_LAYOUTS,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        bullet1: 'A',
        bullet2: 'B',
        bullet3: 'C',
        blocksLabel: 'Blocks',
      },
    );

    expect(slide.elements.filter((el) => el.type === 'shape').length).toBeGreaterThanOrEqual(5);
    const title = slide.elements.find((el) => el.id === 'preview-title');
    expect(title?.type === 'text' && title.content.includes('32px')).toBe(true);
    expect(slide.background).toEqual({ type: 'solid', color: BUSINESS_NAVY_THEME.backgroundColor });
  });
});
