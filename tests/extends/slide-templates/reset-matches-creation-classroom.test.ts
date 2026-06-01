/**
 * Verifies「恢复默认」matches upstream default-professional output for persisted classrooms.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildCompleteScene } from '@/lib/generation/scene-assembler';
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
import type { PPTElement, Slide } from '@/lib/types/slides';
import type { Scene, SlideContent } from '@/lib/types/stage';
import type { SceneOutline } from '@/lib/types/generation';

const CLASSROOMS_DIR = path.join(process.cwd(), 'data', 'classrooms');

const slideOutline: SceneOutline = {
  id: 'o1',
  type: 'slide',
  title: 'T',
  order: 0,
  description: '',
  keyPoints: [],
};

function loadClassroomJson(filename: string): { scenes: Scene[] } {
  const filePath = path.join(CLASSROOMS_DIR, filename);
  const raw = readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as { scenes: Scene[] };
}

/** Upstream default-professional display canvas from a generation baseline slide. */
function expectedUpstreamDefaultCanvas(content: SlideContent): Slide {
  const baseline = content.generationSnapshot ?? content.canvas;
  const theme = clonePipelineDefaultSlideTheme();
  return {
    ...structuredClone(baseline),
    id: content.canvas.id,
    theme,
    background: { type: 'solid', color: theme.backgroundColor },
  };
}

function slideThemeSignature(slide: Slide): string {
  const theme = slide.theme;
  return [
    theme.backgroundColor,
    theme.fontColor,
    theme.themeColors.join(','),
  ].join('|');
}

function elementGeometrySignature(elements: readonly PPTElement[]): string {
  return elements
    .map((el) => {
      const base = `${el.id}:${el.type}:${el.left},${el.top},${el.width},${el.height}`;
      if ('fill' in el && typeof el.fill === 'string') {
        return `${base}:fill=${el.fill}`;
      }
      return base;
    })
    .join(';');
}

function compareCanvasToExpected(
  restored: Slide,
  expected: Slide,
  slideTitle: string,
): void {
  expect(restored.theme.backgroundColor, `${slideTitle} background`).toBe(
    expected.theme.backgroundColor,
  );
  expect(slideThemeSignature(restored), `${slideTitle} theme signature`).toBe(
    slideThemeSignature(expected),
  );
  expect(restored.elements.length, `${slideTitle} element count`).toBe(
    expected.elements.length,
  );
  expect(elementGeometrySignature(restored.elements), `${slideTitle} elements`).toBe(
    elementGeometrySignature(expected.elements),
  );
}

function runResetRoundTrip(
  scenes: readonly Scene[],
  authoritativeScenes: readonly Scene[],
): Scene[] {
  const slideScenes = scenes.filter((scene) => scene.type === 'slide');
  const afterNavy = applySlideTemplateThemeToScenes(slideScenes, BUSINESS_NAVY_THEME);
  const seeded = seedAuthoritativeGenerationSnapshotsFromServer(afterNavy, authoritativeScenes);
  return restoreScenesToPipelineDefaultTheme(seeded, null, authoritativeScenes);
}

describe('reset default matches upstream default professional (persisted JSON)', () => {
  it('fresh buildCompleteScene: navy → reset equals Classic Office display from pipeline snapshot', () => {
    const scene = buildCompleteScene(
      slideOutline,
      {
        elements: [
          {
            type: 'shape',
            id: 's1',
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
      },
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

    const content = scene.content as SlideContent;
    expect(content.canvas.theme).toEqual(UPSTREAM_OFFICE_SLIDE_THEME);
    expect(content.generationSnapshot?.elements[0].fill).toBe('#5b9bd5');

    const restored = runResetRoundTrip([scene], [scene])[0]!;
    compareCanvasToExpected(
      (restored.content as SlideContent).canvas,
      content.canvas,
      scene.title,
    );
  });

  it('legacy persisted chapter: navy → reset matches upstream default derived from baseline', () => {
    const { scenes } = loadClassroomJson('tGAKKqpuhL7djOAXbCaLh-ch-kpGS_PT_01fbeHd39DefZ.json');
    const slideScenes = scenes.filter((scene) => scene.type === 'slide');
    expect(slideScenes.length).toBeGreaterThan(0);

    const expectedById = new Map(
      slideScenes.map((scene) => {
        const content = scene.content as SlideContent;
        return [scene.id, expectedUpstreamDefaultCanvas(content)] as const;
      }),
    );

    const restoredSlides = runResetRoundTrip(scenes, scenes);

    for (const scene of restoredSlides) {
      const expected = expectedById.get(scene.id);
      expect(expected, `missing expected canvas for ${scene.id}`).toBeDefined();
      compareCanvasToExpected(
        (scene.content as SlideContent).canvas,
        expected!,
        scene.title,
      );
    }
  });
});
