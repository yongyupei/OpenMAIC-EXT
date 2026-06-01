/**
 * @extends-from tests/slide-templates/force-apply-template.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, it } from 'vitest';

import { OFFICE_BLUE_SLIDE_THEME } from '@/lib/slide-templates/builtins';
import { CLASSIC_OFFICE_THEME_COLORS } from '@/lib/slide-templates/default-office-theme';
import { BUSINESS_NAVY_THEME } from '@/lib/slide-templates/business-builtin-themes';
import {
  applySlideTemplateToCanvas,
  forceApplySlideTemplateToCanvas,
  resolveSlideThemeGraphics,
} from '@/lib/slide-templates/apply-template-to-scenes';
import type { PPTLineElement, PPTShapeElement, PPTTextElement, Slide } from '@/lib/types/slides';

function minimalSlide(theme: Slide['theme'], elements: Slide['elements']): Slide {
  return {
    id: 's1',
    viewportSize: 1000,
    viewportRatio: 0.5625,
    theme,
    elements,
  };
}

describe('forceApplySlideTemplateToCanvas', () => {
  it('assigns default block colors by element order, not by color distance', () => {
    const slide = minimalSlide(BUSINESS_NAVY_THEME, [
      {
        type: 'shape',
        id: 'a',
        left: 0,
        top: 0,
        width: 100,
        height: 80,
        viewBox: [100, 80],
        path: 'M0,0 L100,0 L100,80 Z',
        fixedRatio: false,
        fill: CLASSIC_OFFICE_THEME_COLORS[1],
      },
      {
        type: 'shape',
        id: 'b',
        left: 0,
        top: 100,
        width: 100,
        height: 80,
        viewBox: [100, 80],
        path: 'M0,0 L100,0 L100,80 Z',
        fixedRatio: false,
        fill: CLASSIC_OFFICE_THEME_COLORS[0],
      },
    ]);

    const forced = forceApplySlideTemplateToCanvas(slide, OFFICE_BLUE_SLIDE_THEME);
    const mapped = applySlideTemplateToCanvas(slide, OFFICE_BLUE_SLIDE_THEME);
    const blocks = resolveSlideThemeGraphics(OFFICE_BLUE_SLIDE_THEME).contentBlockColors;

    const forcedShapes = forced.elements as PPTShapeElement[];
    expect(forcedShapes[0]?.fill).toBe(blocks[0]);
    expect(forcedShapes[1]?.fill).toBe(blocks[1]);
    expect(forcedShapes[0]?.fill).not.toBe((mapped.elements[0] as PPTShapeElement).fill);
  });

  it('forces title and body text colors from default typography', () => {
    const slide = minimalSlide(BUSINESS_NAVY_THEME, [
      {
        type: 'text',
        id: 'title',
        left: 0,
        top: 0,
        width: 400,
        height: 80,
        content: '<p style="color:#f0d78c;font-size:32px">Title</p>',
        defaultFontName: 'Arial',
        defaultColor: '#f0d78c',
      } satisfies PPTTextElement,
    ]);

    const result = forceApplySlideTemplateToCanvas(slide, OFFICE_BLUE_SLIDE_THEME);
    const title = result.elements[0] as PPTTextElement;
    expect(title.defaultColor).toBe('#5b9bd5');
    expect(title.content).toContain('#5b9bd5');
    expect(title.defaultFontName).toBe(OFFICE_BLUE_SLIDE_THEME.fontName);
    expect(title.content).toContain('font-size: 28px');
  });

  it('forces line color, solid style, shape outline, and block fill from default theme', () => {
    const slide = minimalSlide(BUSINESS_NAVY_THEME, [
      {
        type: 'line',
        id: 'line-1',
        left: 0,
        top: 0,
        width: 200,
        height: 0,
        start: [0, 0],
        end: [200, 0],
        style: 'dashed',
        color: '#d4af37',
        points: ['', ''],
      } satisfies PPTLineElement,
      {
        type: 'shape',
        id: 'shape-1',
        left: 0,
        top: 40,
        width: 120,
        height: 80,
        viewBox: [120, 80],
        path: 'M0,0 L120,0 L120,80 Z',
        fixedRatio: false,
        fill: '#152d52',
        outline: { style: 'solid', width: 4, color: '#d4af37' },
      },
    ]);

    const result = forceApplySlideTemplateToCanvas(slide, OFFICE_BLUE_SLIDE_THEME);
    const graphics = resolveSlideThemeGraphics(OFFICE_BLUE_SLIDE_THEME);
    const line = result.elements[0] as PPTLineElement;
    const shape = result.elements[1] as PPTShapeElement;

    expect(line.color).toBe(graphics.lineColor);
    expect(line.style).toBe('solid');
    expect(shape.fill).toBe(graphics.contentBlockColors[0]);
    expect(shape.outline?.color).toBe(OFFICE_BLUE_SLIDE_THEME.themeColors[0]);
    expect(shape.outline?.width).toBe(3);
  });
});
