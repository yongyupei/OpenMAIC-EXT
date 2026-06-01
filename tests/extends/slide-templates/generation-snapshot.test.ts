/**
 * @extends-from tests/slide-templates/generation-snapshot.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, it } from 'vitest';

import { buildCompleteScene } from '@/lib/generation/scene-assembler';
import {
  cloneSlideCanvas,
  ensureGenerationSnapshotsOnLoad,
  seedAuthoritativeGenerationSnapshotsFromServer,
} from '@/lib/generation/slide-generation-snapshot';
import { UPSTREAM_OFFICE_SLIDE_THEME } from '@/lib/slide-templates/default-office-theme';
import { BUSINESS_NAVY_THEME } from '@/lib/slide-templates/business-builtin-themes';
import {
  applySlideTemplateThemeToScenes,
  restoreScenesToPipelineDefaultTheme,
} from '@/lib/slide-templates/apply-template-to-scenes';
import { getBuiltinSlideTemplate } from '@/lib/slide-templates/builtins';
import { BUILTIN_DEFAULT_TEMPLATE_ID } from '@/lib/slide-templates/constants';
import type { PPTShapeElement } from '@/lib/types/slides';
import type { Scene, SlideContent } from '@/lib/types/stage';
import type { SceneOutline } from '@/lib/types/generation';

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

function slideSceneFromBuild(): Scene {
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
  if (!scene || scene.type !== 'slide') throw new Error('expected slide scene');
  return scene;
}

describe('generation snapshot restore', () => {
  it('captures snapshot at buildCompleteScene', () => {
    const scene = slideSceneFromBuild();
    const content = scene.content as SlideContent;

    expect(content.generationSnapshot).toBeDefined();
    expect(content.generationSnapshot?.elements[0].fill).toBe('#5b9bd5');
    expect(content.canvas.elements[0].fill).toBe('#5b9bd5');
    expect(content.canvas.theme).toEqual(UPSTREAM_OFFICE_SLIDE_THEME);
    expect(content.generationSlideTemplateId).toBe(BUILTIN_DEFAULT_TEMPLATE_ID);
  });

  it('restore with authoritative server canvas ignores corrupted local snapshot colors', () => {
    const scene = slideSceneFromBuild();
    const serverScene: Scene = {
      ...scene,
      content: { ...(scene.content as SlideContent) },
    };
    const navyScene = applySlideTemplateThemeToScenes([scene], BUSINESS_NAVY_THEME)[0]!;
    const navyContent = navyScene.content as SlideContent;
    const corruptedLocal: Scene = {
      ...navyScene,
      id: scene.id,
      content: {
        ...navyContent,
        generationSnapshot: cloneSlideCanvas(navyContent.canvas),
      },
    };

    const serverScenes = [serverScene];
    const seeded = seedAuthoritativeGenerationSnapshotsFromServer(
      [corruptedLocal],
      serverScenes,
    );
    const restored = restoreScenesToPipelineDefaultTheme(seeded, null, serverScenes)[0]!;
    const restoredCanvas = (restored.content as SlideContent).canvas;
    const expectedCanvas = (serverScene.content as SlideContent).canvas;

    expect(restoredCanvas.theme.backgroundColor).toBe('#ffffff');
    expect(
      (restoredCanvas.elements[0] as { defaultColor?: string }).defaultColor,
    ).toBe((expectedCanvas.elements[0] as { defaultColor?: string }).defaultColor);
    const restoredShape = restoredCanvas.elements.find((el) => el.type === 'shape' && 'fill' in el);
    expect(restoredShape && 'fill' in restoredShape ? restoredShape.fill : undefined).toBe(
      '#5b9bd5',
    );
  });

  it('restore replays snapshot after template apply and element edits', () => {
    const scene = slideSceneFromBuild();
    const content = scene.content as SlideContent;
    const afterTemplate = applySlideTemplateThemeToScenes(
      [scene],
      BUSINESS_NAVY_THEME,
    )[0]!;
    const navyContent = afterTemplate.content as SlideContent;
    const editedElements = [...navyContent.canvas.elements];
    (editedElements[0] as PPTShapeElement).fill = '#ff00ff';

    const editedScene: Scene = {
      ...afterTemplate,
      content: {
        ...navyContent,
        canvas: { ...navyContent.canvas, elements: editedElements },
      },
    };

    const restored = restoreScenesToPipelineDefaultTheme([editedScene])[0]!;
    const restoredContent = restored.content as SlideContent;

    expect(restoredContent.canvas.theme).toEqual(UPSTREAM_OFFICE_SLIDE_THEME);
    const shape = restoredContent.canvas.elements[0] as PPTShapeElement;
    expect(shape.fill).toBe('#5b9bd5');
    expect(restoredContent.generationSnapshot).toEqual(content.generationSnapshot);
  });

  it('repairs snapshot when office canvas has a custom-template snapshot', () => {
    const scene = slideSceneFromBuild();
    const content = scene.content as SlideContent;
    const navyCanvas = (applySlideTemplateThemeToScenes([scene], BUSINESS_NAVY_THEME)[0]!
      .content as SlideContent).canvas;
    const corrupted: Scene = {
      ...scene,
      content: {
        ...content,
        generationSnapshot: cloneSlideCanvas(navyCanvas),
      },
    };

    const repaired = ensureGenerationSnapshotsOnLoad([corrupted])[0]!;
    const repairedContent = repaired.content as SlideContent;

    expect(repairedContent.canvas.theme.backgroundColor).toBe('#ffffff');
    expect(repairedContent.generationSnapshot?.theme.backgroundColor).toBe('#ffffff');
  });

  it('preserves generationSnapshot when applying another template', () => {
    const scene = slideSceneFromBuild();
    const snapshot = (scene.content as SlideContent).generationSnapshot;

    const afterApply = applySlideTemplateThemeToScenes([scene], BUSINESS_NAVY_THEME)[0]!;
    expect((afterApply.content as SlideContent).generationSnapshot).toEqual(snapshot);
  });
});
