/**
 * @extends-from tests/slide-templates/apply-template-to-scenes.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, it } from 'vitest';

import {
  applySlideTemplateThemeToScenes,
  applySlideTemplateToCanvas,
} from '@/lib/slide-templates/apply-template-to-scenes';
import {
  buildThemeColorRemap,
  remapHtmlThemeColors,
} from '@/lib/slide-templates/theme-color-remap';
import { deriveContentBlockColors } from '@/lib/slide-templates/theme-graphics';
import { OFFICE_BLUE_SLIDE_THEME } from '@/lib/slide-templates/builtins';
import type { PPTShapeElement, PPTTextElement } from '@/lib/types/slides';
import type { Scene } from '@/lib/types/stage';

const WARM_ORANGE_THEME = {
  backgroundColor: '#fff8f0',
  themeColors: ['#e67e22', '#f39c12', '#d35400', '#e74c3c', '#c0392b'],
  fontColor: '#2c1810',
  fontName: 'Microsoft YaHei',
};

function slideScene(id: string, stageId: string): Scene {
  return {
    id,
    stageId,
    type: 'slide',
    title: 'Slide',
    order: 0,
    content: {
      type: 'slide',
      canvas: {
        id: `canvas-${id}`,
        viewportSize: 1000,
        viewportRatio: 0.5625,
        theme: OFFICE_BLUE_SLIDE_THEME,
        elements: [
          {
            type: 'text',
            id: 'title',
            left: 0,
            top: 0,
            width: 400,
            height: 80,
            rotate: 0,
            content: '<p style="color:#5b9bd5">Title</p>',
            defaultFontName: OFFICE_BLUE_SLIDE_THEME.fontName,
            defaultColor: OFFICE_BLUE_SLIDE_THEME.fontColor,
          } satisfies PPTTextElement,
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
          } satisfies PPTShapeElement,
        ],
        background: { type: 'solid', color: OFFICE_BLUE_SLIDE_THEME.backgroundColor },
      },
    },
    actions: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('applySlideTemplateToCanvas', () => {
  it('updates background, theme, text colors, and shape fills', () => {
    const scene = slideScene('a', 'stage');
    const canvas = applySlideTemplateToCanvas(scene.content.canvas, WARM_ORANGE_THEME);

    expect(canvas.theme.backgroundColor).toBe(WARM_ORANGE_THEME.backgroundColor);
    expect(canvas.background).toEqual({ type: 'solid', color: WARM_ORANGE_THEME.backgroundColor });

    const title = canvas.elements[0] as PPTTextElement;
    expect(title.defaultColor).toBe(WARM_ORANGE_THEME.themeColors[0]);

    const shape = canvas.elements[1] as PPTShapeElement;
    const warmBlocks = deriveContentBlockColors(WARM_ORANGE_THEME);
    expect(warmBlocks).toContain(shape.fill);
  });

  it('buildThemeColorRemap maps palette accent colors across themes', () => {
    const map = buildThemeColorRemap(OFFICE_BLUE_SLIDE_THEME, WARM_ORANGE_THEME);
    const remapped = map.get('#5b9bd5');
    expect(remapped).toBeDefined();
    expect(WARM_ORANGE_THEME.themeColors).toContain(remapped);
    expect(remapHtmlThemeColors('<span style="color:#5b9bd5">x</span>', map).toLowerCase()).toContain(
      remapped!.toLowerCase(),
    );
  });
});

describe('applySlideTemplateThemeToScenes', () => {
  it('updates theme and background for all slide scenes when scope is null', () => {
    const scenes = [slideScene('a', 'stage'), slideScene('b', 'stage')];
    const next = applySlideTemplateThemeToScenes(scenes, OFFICE_BLUE_SLIDE_THEME, null);
    expect((next[0]?.content as { canvas: { theme: { backgroundColor: string } } }).canvas.theme
      .backgroundColor).toBe(OFFICE_BLUE_SLIDE_THEME.backgroundColor);
    expect((next[1]?.content as { canvas: { theme: { backgroundColor: string } } }).canvas.theme
      .backgroundColor).toBe(OFFICE_BLUE_SLIDE_THEME.backgroundColor);
  });

  it('updates only scenes in scope set', () => {
    const scenes = [slideScene('a', 'stage'), slideScene('b', 'stage')];
    const next = applySlideTemplateThemeToScenes(
      scenes,
      WARM_ORANGE_THEME,
      new Set(['b']),
    );
    const unchanged = (next[0]?.content as { canvas: { elements: PPTShapeElement[] } }).canvas
      .elements[1]!;
    const changed = (next[1]?.content as { canvas: { elements: PPTShapeElement[]; theme: { backgroundColor: string }; background: { color: string } } }).canvas;
    expect(unchanged.fill).toBe('#5b9bd5');
    expect(changed.theme.backgroundColor).toBe(WARM_ORANGE_THEME.backgroundColor);
    expect(changed.background.color).toBe(WARM_ORANGE_THEME.backgroundColor);
    const warmBlocks = deriveContentBlockColors(WARM_ORANGE_THEME);
    expect(warmBlocks).toContain((changed.elements[1] as PPTShapeElement).fill);
  });
});
