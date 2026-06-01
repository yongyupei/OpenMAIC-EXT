/**
 * @extends-from tests/slide-templates/pipeline-reset.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, it } from 'vitest';

import { PIPELINE_DEFAULT_SLIDE_THEME } from '@/lib/generation/pipeline-default-slide-theme';
import { UPSTREAM_OFFICE_SLIDE_THEME } from '@/lib/slide-templates/default-office-theme';
import { BUSINESS_NAVY_THEME } from '@/lib/slide-templates/business-builtin-themes';
import {
  applySlideTemplateThemeToScenes,
  restoreCanvasToPipelineDefault,
  restoreScenesToPipelineDefaultTheme,
} from '@/lib/slide-templates/apply-template-to-scenes';
import { buildCompleteScene } from '@/lib/generation/scene-assembler';
import { buildPipelineDefaultSlideCanvas, buildThemedSlideCanvas } from '@/lib/generation/pipeline-slide-canvas';
import type { PPTShapeElement } from '@/lib/types/slides';
import type { SceneOutline } from '@/lib/types/generation';
import { BUILTIN_DEFAULT_TEMPLATE_ID } from '@/lib/slide-templates/constants';
import { getBuiltinSlideTemplate } from '@/lib/slide-templates/builtins';

const rawShape = {
  type: 'shape',
  id: 's1',
  left: 0,
  top: 0,
  width: 200,
  height: 100,
  rotate: 0,
  viewBox: [200, 100] as [number, number],
  path: 'M0,0 L200,0 L200,100 Z',
  fixedRatio: false,
  fill: '#5b9bd5',
} as const;

const slideOutline: SceneOutline = {
  id: 'o1',
  type: 'slide',
  title: 'T',
  order: 0,
  description: '',
  keyPoints: [],
};

describe('pipeline default slide assembly', () => {
  it('buildCompleteScene with default template preserves AI element colors (legacy pipeline)', () => {
    const scene = buildCompleteScene(
      slideOutline,
      { elements: [{ ...rawShape }] },
      [],
      'stage-1',
      {
        resolvedTemplate: {
          record: getBuiltinSlideTemplate(BUILTIN_DEFAULT_TEMPLATE_ID)!,
          source: 'builtin',
        },
      },
    );

    const content =
      scene?.type === 'slide'
        ? (scene.content as {
            canvas: { elements: PPTShapeElement[]; theme: unknown };
            generationSnapshot?: { theme: unknown; elements: PPTShapeElement[] };
          })
        : null;

    expect(content?.canvas.theme).toEqual(UPSTREAM_OFFICE_SLIDE_THEME);
    expect(content?.canvas.elements[0].fill).toBe('#5b9bd5');
    expect(content?.generationSnapshot?.elements[0].fill).toBe('#5b9bd5');
    expect(content?.generationSnapshot?.theme).toEqual({
      backgroundColor: PIPELINE_DEFAULT_SLIDE_THEME.backgroundColor,
      themeColors: [...PIPELINE_DEFAULT_SLIDE_THEME.themeColors],
      fontColor: PIPELINE_DEFAULT_SLIDE_THEME.fontColor,
      fontName: PIPELINE_DEFAULT_SLIDE_THEME.fontName,
      outline: { ...PIPELINE_DEFAULT_SLIDE_THEME.outline },
      shadow: { ...PIPELINE_DEFAULT_SLIDE_THEME.shadow },
    });
  });

  it('buildCompleteScene with custom template remaps display and keeps raw AI snapshot', () => {
    const scene = buildCompleteScene(
      slideOutline,
      { elements: [{ ...rawShape }] },
      [],
      'stage-1',
      {
        resolvedTemplate: {
          record: getBuiltinSlideTemplate('builtin:theme-business-navy')!,
          source: 'builtin',
        },
      },
    );

    const content =
      scene?.type === 'slide'
        ? (scene.content as {
            canvas: { theme: { backgroundColor: string }; elements: PPTShapeElement[] };
            generationSnapshot?: { elements: PPTShapeElement[] };
          })
        : null;

    expect(content?.canvas.theme.backgroundColor).toBe(BUSINESS_NAVY_THEME.backgroundColor);
    expect(content?.canvas.elements[0]?.fill).not.toBe('#5b9bd5');
    expect(content?.generationSnapshot?.elements[0]?.fill).toBe('#5b9bd5');
  });

  it('restoreScenesToPipelineDefaultTheme uses generationSnapshot when present', () => {
    const scene = buildCompleteScene(
      slideOutline,
      { elements: [{ ...rawShape }] },
      [],
      'stage-1',
      {
        resolvedTemplate: {
          record: getBuiltinSlideTemplate(BUILTIN_DEFAULT_TEMPLATE_ID)!,
          source: 'builtin',
        },
      },
    );
    if (!scene || scene.type !== 'slide') throw new Error('expected slide');

    const afterTemplate = applySlideTemplateThemeToScenes(
      [scene],
      BUSINESS_NAVY_THEME,
    )[0]!;
    const restored = restoreScenesToPipelineDefaultTheme([afterTemplate])[0]!;
    const restoredContent = restored.content as import('@/lib/types/stage').SlideContent;

    expect(restoredContent.canvas.theme).toEqual(UPSTREAM_OFFICE_SLIDE_THEME);
    const shape = restoredContent.canvas.elements[0] as PPTShapeElement;
    expect(shape.fill).toBe('#5b9bd5');
  });

  it('restoreCanvasToPipelineDefault keeps upstream theme and raw AI fills', () => {
    const canvas = buildPipelineDefaultSlideCanvas([{ ...rawShape }], { id: 'c1' });
    const restored = restoreCanvasToPipelineDefault(canvas);
    const shape = restored.elements[0] as PPTShapeElement;

    expect(restored.theme).toEqual(UPSTREAM_OFFICE_SLIDE_THEME);
    expect(shape.fill).toBe('#5b9bd5');
  });

  it('restoreCanvasToPipelineDefault reverse-remaps business canvas back to office palette', () => {
    const canvas = buildThemedSlideCanvas([{ ...rawShape }], BUSINESS_NAVY_THEME, { id: 'c1' });
    const restored = restoreCanvasToPipelineDefault(canvas);
    const shape = restored.elements[0] as PPTShapeElement;

    expect(restored.theme).toEqual(UPSTREAM_OFFICE_SLIDE_THEME);
    expect(shape.fill).not.toBe((canvas.elements[0] as PPTShapeElement).fill);
    expect(restored.background).toEqual({ type: 'solid', color: UPSTREAM_OFFICE_SLIDE_THEME.backgroundColor });
  });

  it('default → navy → default round-trip works without generationSnapshot', () => {
    const canvas = buildPipelineDefaultSlideCanvas([{ ...rawShape }], { id: 'c1' });
    const scene = {
      id: 'slide-1',
      stageId: 'stage-1',
      type: 'slide' as const,
      title: 'T',
      order: 0,
      content: { type: 'slide' as const, canvas },
      actions: [],
      createdAt: 0,
      updatedAt: 0,
    };

    const afterNavy = applySlideTemplateThemeToScenes([scene], BUSINESS_NAVY_THEME)[0]!;
    expect((afterNavy.content as { canvas: { theme: { backgroundColor: string } } }).canvas.theme
      .backgroundColor).toBe(BUSINESS_NAVY_THEME.backgroundColor);

    const restored = restoreScenesToPipelineDefaultTheme([afterNavy])[0]!;
    const restoredCanvas = (restored.content as import('@/lib/types/stage').SlideContent).canvas;
    expect(restoredCanvas.theme).toEqual(UPSTREAM_OFFICE_SLIDE_THEME);
    expect((restoredCanvas.elements[0] as PPTShapeElement).fill).toBe('#5b9bd5');
  });
});
