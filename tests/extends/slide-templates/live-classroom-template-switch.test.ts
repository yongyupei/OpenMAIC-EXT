/**
 * Integration test against real classroom payload shape (corrupted snapshot + default canvas).
 */
import { describe, expect, it } from 'vitest';

import { BUSINESS_NAVY_THEME } from '@/lib/slide-templates/business-builtin-themes';
import { getBuiltinSlideTemplate } from '@/lib/slide-templates/builtins';
import { BUILTIN_DEFAULT_TEMPLATE_ID } from '@/lib/slide-templates/constants';
import { UPSTREAM_OFFICE_SLIDE_THEME } from '@/lib/slide-templates/default-office-theme';
import {
  applySlideTemplateThemeToScenes,
  restoreScenesToPipelineDefaultTheme,
} from '@/lib/slide-templates/apply-template-to-scenes';
import { clonePipelineDefaultSlideTheme } from '@/lib/generation/pipeline-default-slide-theme';
import { seedAuthoritativeGenerationSnapshotsFromServer } from '@/lib/generation/slide-generation-snapshot';
import type { Scene, SlideContent } from '@/lib/types/stage';

/** Minimal corrupted legacy slide mirroring production classroom data. */
function legacyCorruptedSlideScene(): Scene {
  return {
    id: 'legacy-slide-1',
    stageId: 'classroom-1',
    type: 'slide',
    title: 'Legacy',
    order: 0,
    content: {
      type: 'slide',
      canvas: {
        id: 'canvas-1',
        viewportSize: 1000,
        viewportRatio: 0.5625,
        theme: {
          backgroundColor: '#ffffff',
          themeColors: [...UPSTREAM_OFFICE_SLIDE_THEME.themeColors],
          fontColor: '#333333',
          fontName: 'Microsoft YaHei',
        },
        elements: [
          {
            type: 'shape',
            id: 'shape-1',
            left: 0,
            top: 0,
            width: 200,
            height: 100,
            rotate: 0,
            viewBox: [200, 100],
            path: 'M0,0 L200,0 L200,100 Z',
            fixedRatio: false,
            fill: '#5b9bd5',
          },
        ],
        background: { type: 'solid', color: '#ffffff' },
      },
      generationSnapshot: {
        id: 'snap-1',
        viewportSize: 1000,
        viewportRatio: 0.5625,
        theme: {
          backgroundColor: '#1c1917',
          themeColors: ['#86efac', '#a8a29e', '#78716c', '#57534e', '#44403c'],
          fontColor: '#fafaf9',
          fontName: 'Microsoft YaHei',
        },
        elements: [
          {
            type: 'shape',
            id: 'shape-1',
            left: 0,
            top: 0,
            width: 200,
            height: 100,
            rotate: 0,
            viewBox: [200, 100],
            path: 'M0,0 L200,0 L200,100 Z',
            fixedRatio: false,
            fill: '#272e26',
          },
        ],
        background: { type: 'solid', color: '#1c1917' },
      },
      generationSlideTemplateId: BUILTIN_DEFAULT_TEMPLATE_ID,
    },
    actions: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

function firstSlideCanvasBg(scenes: readonly Scene[]): string {
  const slide = scenes.find((scene) => scene.type === 'slide');
  return (slide?.content as SlideContent).canvas.theme.backgroundColor;
}

describe('live classroom template switch (legacy corrupted snapshot)', () => {
  it('default → navy → default round-trip restores original canvas theme', () => {
    const initial = legacyCorruptedSlideScene();
    const baselineBg = firstSlideCanvasBg([initial]);

    const navyTemplate = getBuiltinSlideTemplate('builtin:theme-business-navy');
    expect(navyTemplate).toBeDefined();

    const authoritative = [initial];
    const seeded = seedAuthoritativeGenerationSnapshotsFromServer([initial], authoritative);
    const afterNavy = applySlideTemplateThemeToScenes(seeded, navyTemplate!.theme);
    const navyBg = firstSlideCanvasBg(afterNavy);

    expect(navyBg).not.toBe(baselineBg);
    expect(navyBg).toBe(BUSINESS_NAVY_THEME.backgroundColor);

    const afterReset = restoreScenesToPipelineDefaultTheme(
      afterNavy,
      null,
      authoritative,
    );
    const resetBg = firstSlideCanvasBg(afterReset);
    const seededContent = seeded[0]!.content as SlideContent;
    const baseline =
      seededContent.generationSnapshot ?? (initial.content as SlideContent).canvas;
    const theme = clonePipelineDefaultSlideTheme();
    const expectedDefault = {
      ...structuredClone(baseline),
      id: 'canvas-1',
      theme,
      background: { type: 'solid', color: theme.backgroundColor },
    };

    expect(resetBg).toBe(expectedDefault.theme.backgroundColor);
  });
});
