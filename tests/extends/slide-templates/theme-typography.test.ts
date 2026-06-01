/**
 * @extends-from tests/slide-templates/theme-typography.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, it } from 'vitest';

import { OFFICE_BLUE_SLIDE_THEME } from '@/lib/slide-templates/builtins';
import { BUSINESS_NAVY_THEME } from '@/lib/slide-templates/business-builtin-themes';
import { applySlideTemplateToCanvas } from '@/lib/slide-templates/apply-template-to-scenes';
import {
  inferTextType,
  resolveSlideThemeTypography,
  resolveTextColorForTextType,
} from '@/lib/slide-templates/theme-typography';
import type { PPTTextElement } from '@/lib/types/slides';
import type { Slide } from '@/lib/types/slides';

function slideWithTextElements(): Slide {
  return {
    id: 'slide-1',
    viewportSize: 1000,
    viewportRatio: 0.5625,
    theme: OFFICE_BLUE_SLIDE_THEME,
    elements: [
      {
        type: 'text',
        id: 'title',
        left: 80,
        top: 80,
        width: 800,
        height: 72,
        rotate: 0,
        textType: 'title',
        content: '<p style="font-size: 32px; font-family: Microsoft YaHei; color:#2b579a">标题</p>',
        defaultFontName: 'Microsoft YaHei',
        defaultColor: '#2b579a',
      } satisfies PPTTextElement,
      {
        type: 'text',
        id: 'body',
        left: 80,
        top: 200,
        width: 800,
        height: 280,
        rotate: 0,
        content: '<p style="font-size: 18px; color:#333333">正文内容</p>',
        defaultFontName: 'Microsoft YaHei',
        defaultColor: '#333333',
      } satisfies PPTTextElement,
    ],
    background: { type: 'solid', color: '#ffffff' },
  };
}

describe('resolveSlideThemeTypography', () => {
  it('resolves explicit title and body colors on dark business themes', () => {
    const typo = resolveSlideThemeTypography(BUSINESS_NAVY_THEME);
    expect(typo.titleFontColor).toBe('#f1f5f9');
    expect(typo.bodyFontColor).toBe('#cbd5e1');
    expect(resolveTextColorForTextType('title', typo)).toBe('#f1f5f9');
    expect(resolveTextColorForTextType('content', typo)).toBe('#cbd5e1');
  });
});

describe('inferTextType', () => {
  it('detects title from large font-size in HTML', () => {
    const el: PPTTextElement = {
      type: 'text',
      id: 't1',
      left: 0,
      top: 0,
      width: 400,
      height: 40,
      rotate: 0,
      content: '<p style="font-size: 28px">Heading</p>',
      defaultFontName: 'Arial',
      defaultColor: '#000',
    };
    expect(inferTextType(el)).toBe('title');
  });
});

describe('applySlideTemplateToCanvas typography', () => {
  it('applies title and body colors and fonts when switching to business navy', () => {
    const typo = resolveSlideThemeTypography(BUSINESS_NAVY_THEME);
    const next = applySlideTemplateToCanvas(slideWithTextElements(), BUSINESS_NAVY_THEME);
    const title = next.elements[0] as PPTTextElement;
    const body = next.elements[1] as PPTTextElement;

    expect(title.defaultColor).toBe('#f1f5f9');
    expect(body.defaultColor).toBe('#cbd5e1');
    expect(title.defaultFontName).toBe('Microsoft YaHei');
    expect(title.content).toContain('font-family: Microsoft YaHei');
    expect(title.content.toLowerCase()).toContain(typo.titleFontColor.toLowerCase());
    expect(body.content.toLowerCase()).toContain(typo.bodyFontColor.toLowerCase());
    expect(next.background).toEqual({ type: 'solid', color: BUSINESS_NAVY_THEME.backgroundColor });
  });
});
