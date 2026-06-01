/**
 * @extends-from tests/slide-templates/theme-graphics.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, it } from 'vitest';
import tinycolor from 'tinycolor2';

import { OFFICE_BLUE_SLIDE_THEME } from '@/lib/slide-templates/builtins';
import { BUSINESS_NAVY_THEME } from '@/lib/slide-templates/business-builtin-themes';
import {
  applySlideTemplateToCanvas,
  forceApplySlideTemplateToCanvas,
  applyThemeGraphicsToElements,
  buildGraphicsColorRemap,
  closestContentBlockIndex,
  deriveContentBlockColors,
  resolveSlideThemeGraphics,
} from '@/lib/slide-templates/apply-template-to-scenes';
import type { PPTShapeElement, Slide } from '@/lib/types/slides';

function minimalSlide(
  theme: typeof OFFICE_BLUE_SLIDE_THEME,
  elements: Slide['elements'],
): Slide {
  return {
    id: 's1',
    viewportSize: 1000,
    viewportRatio: 0.5625,
    theme,
    elements,
  };
}

describe('deriveContentBlockColors', () => {
  it('uses explicit contentBlockColors when defined on template', () => {
    const blocks = deriveContentBlockColors(BUSINESS_NAVY_THEME);
    expect(blocks.length).toBe(BUSINESS_NAVY_THEME.themeColors.length);
    expect(blocks).toEqual(BUSINESS_NAVY_THEME.contentBlockColors);
  });

  it('derives lighter blocks for light backgrounds when not explicit', () => {
    const blocks = deriveContentBlockColors(OFFICE_BLUE_SLIDE_THEME);
    expect(blocks.length).toBe(OFFICE_BLUE_SLIDE_THEME.themeColors.length);
    blocks.forEach((color) => {
      expect(color.toLowerCase()).not.toBe(OFFICE_BLUE_SLIDE_THEME.backgroundColor.toLowerCase());
    });
  });
});

describe('buildGraphicsColorRemap', () => {
  it('maps office blue accent fills to navy content blocks', () => {
    const map = buildGraphicsColorRemap(OFFICE_BLUE_SLIDE_THEME, BUSINESS_NAVY_THEME);
    const navyBlocks = deriveContentBlockColors(BUSINESS_NAVY_THEME);
    const remapped = map.get('#5b9bd5');
    expect(remapped).toBeDefined();
    expect(navyBlocks).toContain(remapped);
  });
});

describe('closestContentBlockIndex', () => {
  it('matches shape fill to nearest palette slot', () => {
    const index = closestContentBlockIndex('#5b9bd5', OFFICE_BLUE_SLIDE_THEME);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(deriveContentBlockColors(OFFICE_BLUE_SLIDE_THEME).length);
  });
});

describe('applyThemeGraphicsToElements', () => {
  it('remaps shape fill from light office blue to dark navy blocks', () => {
    const shape: PPTShapeElement = {
      type: 'shape',
      id: 'block-1',
      left: 0,
      top: 0,
      width: 200,
      height: 120,
      viewBox: [200, 120],
      path: 'M0,0 L200,0 L200,120 Z',
      fixedRatio: false,
      fill: '#5b9bd5',
    };

    const [updated] = applyThemeGraphicsToElements(
      [shape],
      BUSINESS_NAVY_THEME,
      OFFICE_BLUE_SLIDE_THEME,
    );
    const graphics = resolveSlideThemeGraphics(BUSINESS_NAVY_THEME);
    expect(updated?.type).toBe('shape');
    if (updated?.type === 'shape') {
      expect(graphics.contentBlockColors).toContain(updated.fill);
      expect(tinycolor(updated.fill).isDark()).toBe(true);
      expect(updated.shadow).toBeDefined();
    }
  });
});

describe('applySlideTemplateToCanvas graphics integration', () => {
  it('remaps shape fills and sets navy background when applying business template', () => {
    const slide = minimalSlide(OFFICE_BLUE_SLIDE_THEME, [
      {
        type: 'shape',
        id: 'accent',
        left: 0,
        top: 100,
        width: 200,
        height: 120,
        rotate: 0,
        viewBox: [200, 120],
        path: 'M0,0 L200,0 L200,120 Z',
        fixedRatio: false,
        fill: OFFICE_BLUE_SLIDE_THEME.themeColors[0]!,
      },
    ]);

    const result = applySlideTemplateToCanvas(slide, BUSINESS_NAVY_THEME);
    const shape = result.elements[0] as PPTShapeElement;
    const navyBlocks = deriveContentBlockColors(BUSINESS_NAVY_THEME);
    expect(navyBlocks).toContain(shape.fill);
    expect(shape.fill).not.toBe('#5b9bd5');
    expect(result.theme.backgroundColor).toBe(BUSINESS_NAVY_THEME.backgroundColor);
    expect(result.background).toEqual({ type: 'solid', color: BUSINESS_NAVY_THEME.backgroundColor });
  });

  it('force reset applies default palette without remapping from dark template', () => {
    const navyBlocks = deriveContentBlockColors(BUSINESS_NAVY_THEME);
    const slide = minimalSlide(BUSINESS_NAVY_THEME, [
      {
        type: 'shape',
        id: 'block-a',
        left: 0,
        top: 0,
        width: 200,
        height: 120,
        viewBox: [200, 120],
        path: 'M0,0 L200,0 L200,120 Z',
        fixedRatio: false,
        fill: navyBlocks[0]!,
      },
      {
        type: 'shape',
        id: 'block-b',
        left: 220,
        top: 0,
        width: 200,
        height: 120,
        viewBox: [200, 120],
        path: 'M0,0 L200,0 L200,120 Z',
        fixedRatio: false,
        fill: navyBlocks[2]!,
      },
    ]);

    const result = forceApplySlideTemplateToCanvas(slide, OFFICE_BLUE_SLIDE_THEME);
    const defaultGraphics = resolveSlideThemeGraphics(OFFICE_BLUE_SLIDE_THEME);
    const shapes = result.elements.filter((el) => el.type === 'shape') as PPTShapeElement[];

    expect(shapes[0]?.fill).toBe(defaultGraphics.contentBlockColors[0]);
    expect(shapes[1]?.fill).toBe(defaultGraphics.contentBlockColors[1]);
    expect(shapes[0]?.outline?.color).toBe(OFFICE_BLUE_SLIDE_THEME.themeColors[0]);
    expect(shapes[0]?.outline?.width).toBe(3);
    expect(defaultGraphics.lineColor).toBe('#5b9bd5');
    expect(result.background).toEqual({ type: 'solid', color: '#ffffff' });
    expect(result.theme).toMatchObject({
      backgroundColor: OFFICE_BLUE_SLIDE_THEME.backgroundColor,
      fontColor: OFFICE_BLUE_SLIDE_THEME.fontColor,
    });
  });

  it('assigns distinct block fills to identical card panels on dark templates', () => {
    const sharedFill = '#5b9bd5';
    const makeCard = (
      id: string,
      left: number,
      top: number,
    ): PPTShapeElement => ({
      type: 'shape',
      id,
      left,
      top,
      width: 420,
      height: 180,
      viewBox: [420, 180],
      path: 'M0,0 L420,0 L420,180 Z',
      fixedRatio: false,
      fill: sharedFill,
    });
    const makeStrip = (id: string, left: number, top: number): PPTShapeElement => ({
      type: 'shape',
      id,
      left,
      top,
      width: 8,
      height: 180,
      viewBox: [8, 180],
      path: 'M0,0 L8,0 L8,180 Z',
      fixedRatio: false,
      fill: '#70ad47',
    });

    const elements: PPTShapeElement[] = [
      makeCard('card-tl', 60, 200),
      makeStrip('strip-tl', 60, 200),
      makeCard('card-tr', 520, 200),
      makeStrip('strip-tr', 520, 200),
      makeCard('card-bl', 60, 420),
      makeStrip('strip-bl', 60, 420),
      makeCard('card-br', 520, 420),
      makeStrip('strip-br', 520, 420),
    ];

    const updated = applyThemeGraphicsToElements(
      elements,
      BUSINESS_NAVY_THEME,
      OFFICE_BLUE_SLIDE_THEME,
    ).filter((el) => el.type === 'shape') as PPTShapeElement[];

    const cards = updated.filter((shape) => shape.width >= 400);
    const strips = updated.filter((shape) => shape.width <= 8);
    const cardFills = new Set(cards.map((shape) => shape.fill.toLowerCase()));
    const stripFills = new Set(strips.map((shape) => shape.fill.toLowerCase()));

    expect(cards).toHaveLength(4);
    expect(strips).toHaveLength(4);
    expect(cardFills.size).toBe(4);
    expect(stripFills.size).toBeGreaterThanOrEqual(3);
  });
});
