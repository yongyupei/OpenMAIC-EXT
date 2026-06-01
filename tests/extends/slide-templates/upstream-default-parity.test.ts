/**
 * Documents and guards parity between upstream scene-builder and fork default-template assembly.
 */
import { describe, expect, it } from 'vitest';

import { buildCompleteScene } from '@/lib/generation/scene-assembler';
import { UPSTREAM_OFFICE_SLIDE_THEME } from '@/lib/slide-templates/default-office-theme';
import { BUSINESS_NAVY_THEME } from '@/lib/slide-templates/business-builtin-themes';
import { getBuiltinSlideTemplate } from '@/lib/slide-templates/builtins';
import { BUILTIN_DEFAULT_TEMPLATE_ID } from '@/lib/slide-templates/constants';
import type { GeneratedSlideContent } from '@/lib/types/generation';
import type { PPTShapeElement, PPTTextElement, Slide } from '@/lib/types/slides';
import type { SceneOutline } from '@/lib/types/generation';
import type { SlideContent } from '@/lib/types/stage';

const slideOutline: SceneOutline = {
  id: 'o1',
  type: 'slide',
  title: '对比测试',
  order: 0,
  description: '要点说明',
  keyPoints: ['第一点', '第二点'],
};

/** Mirrors upstream `lib/generation/scene-builder.ts` slide assembly (no fork hooks). */
function buildUpstreamStyleSlide(content: GeneratedSlideContent): Slide {
  return {
    id: 'upstream-slide',
    viewportSize: 1000,
    viewportRatio: 0.5625,
    theme: { ...UPSTREAM_OFFICE_SLIDE_THEME },
    elements: [...content.elements],
    background: content.background,
  };
}

const rawGeneratedContent: GeneratedSlideContent = {
  elements: [
    {
      type: 'text',
      id: 'text_title',
      left: 80,
      top: 60,
      width: 840,
      height: 72,
      rotate: 0,
      content: '<p style="font-size: 32px; color:#2b579a">标题</p>',
      defaultFontName: 'Microsoft YaHei',
      defaultColor: '#2b579a',
      textType: 'title',
    } satisfies PPTTextElement,
    {
      type: 'shape',
      id: 'shape_block',
      left: 80,
      top: 180,
      width: 320,
      height: 120,
      rotate: 0,
      viewBox: [320, 120],
      path: 'M0,0 L320,0 L320,120 Z',
      fixedRatio: false,
      fill: '#5b9bd5',
    } satisfies PPTShapeElement,
  ],
  background: { type: 'solid', color: '#ffffff' },
};

describe('upstream default template parity', () => {
  it('fork default buildCompleteScene matches upstream scene-builder canvas shape', () => {
    const scene = buildCompleteScene(
      slideOutline,
      rawGeneratedContent,
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

    const forkCanvas = (scene.content as SlideContent).canvas;
    const upstreamCanvas = buildUpstreamStyleSlide(rawGeneratedContent);

    expect(forkCanvas.theme).toEqual(upstreamCanvas.theme);
    expect(forkCanvas.elements).toEqual(upstreamCanvas.elements);
    expect(forkCanvas.background).toEqual(upstreamCanvas.background);
    expect(forkCanvas.viewportSize).toBe(upstreamCanvas.viewportSize);
    expect(forkCanvas.viewportRatio).toBe(upstreamCanvas.viewportRatio);
  });

  it('business template assembly remaps elements onto dark background palette', () => {
    const scene = buildCompleteScene(
      slideOutline,
      rawGeneratedContent,
      [],
      'stage-1',
      {
        resolvedTemplate: {
          record: getBuiltinSlideTemplate('builtin:theme-business-navy')!,
          source: 'builtin',
        },
      },
    );
    if (!scene || scene.type !== 'slide') throw new Error('expected slide');

    const forkCanvas = (scene.content as SlideContent).canvas;
    expect(forkCanvas.elements).not.toEqual(rawGeneratedContent.elements);
    expect(forkCanvas.background).toEqual({
      type: 'solid',
      color: BUSINESS_NAVY_THEME.backgroundColor,
    });
    expect(forkCanvas.theme.backgroundColor).toBe(BUSINESS_NAVY_THEME.backgroundColor);
    expect(forkCanvas.theme.fontColor).toBe(BUSINESS_NAVY_THEME.fontColor);
    expect(forkCanvas.theme.themeColors).toEqual(BUSINESS_NAVY_THEME.themeColors);
    expect(forkCanvas.theme.outline?.color).toBe(BUSINESS_NAVY_THEME.outline?.color);
  });
});
