/**
 * @extends-from lib/generation/slide-generation-snapshot.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { isClassicOfficeSlideTheme } from '@/lib/slide-templates/default-office-theme';
import { BUILTIN_DEFAULT_TEMPLATE_ID } from '@/lib/slide-templates/constants';
import {
  isPipelineDefaultSlideTheme,
  type PipelineSlideAssemblyOptions,
} from '@/lib/generation/pipeline-default-slide-theme';
import type { Slide, SlideTheme } from '@/lib/types/slides';
import type { Scene, SlideContent } from '@/lib/types/stage';

/** Deep-clone a slide canvas for immutable generation snapshots. */
export function cloneSlideCanvas(slide: Slide): Slide {
  return structuredClone(slide);
}

export function resolveGenerationSlideTemplateId(
  options?: PipelineSlideAssemblyOptions,
): string {
  return options?.resolvedTemplate?.record.id ?? BUILTIN_DEFAULT_TEMPLATE_ID;
}

/** Captures the canvas exactly as first assembled at generation time. */
export function buildSlideContentWithGenerationSnapshot(
  canvas: Slide,
  options?: PipelineSlideAssemblyOptions,
): SlideContent {
  return {
    type: 'slide',
    canvas,
    generationSnapshot: cloneSlideCanvas(canvas),
    generationSlideTemplateId: resolveGenerationSlideTemplateId(options),
  };
}

/**
 * Display canvas uses the upstream Office theme; snapshot keeps the same assembly for restore.
 */
export function buildSlideContentWithPipelineGenerationSnapshot(
  displayCanvas: Slide,
  pipelineCanvas: Slide,
  options?: PipelineSlideAssemblyOptions,
): SlideContent {
  return {
    type: 'slide',
    canvas: displayCanvas,
    generationSnapshot: cloneSlideCanvas(pipelineCanvas),
    generationSlideTemplateId: resolveGenerationSlideTemplateId(options),
  };
}

function isDefaultGenerationDisplayTheme(theme: SlideTheme): boolean {
  return isPipelineDefaultSlideTheme(theme) || isClassicOfficeSlideTheme(theme);
}

export function isTrustedGenerationBaselineTheme(theme: SlideTheme): boolean {
  return isPipelineDefaultSlideTheme(theme) || isClassicOfficeSlideTheme(theme);
}

function slideContentNeedsGenerationSnapshot(content: SlideContent): boolean {
  if (!content.generationSnapshot) {
    return isDefaultGenerationDisplayTheme(content.canvas.theme);
  }
  const canvasIsDefault = isDefaultGenerationDisplayTheme(content.canvas.theme);
  if (!canvasIsDefault) {
    return false;
  }
  if (isTrustedGenerationBaselineTheme(content.generationSnapshot.theme)) {
    return false;
  }
  // Default display but snapshot captured after a custom template — repair from canvas.
  return !isDefaultGenerationDisplayTheme(content.generationSnapshot.theme);
}

function captureGenerationSnapshotFields(
  content: SlideContent,
): Pick<SlideContent, 'generationSnapshot' | 'generationSlideTemplateId'> {
  return {
    generationSnapshot: cloneSlideCanvas(content.canvas),
    generationSlideTemplateId:
      content.generationSlideTemplateId ?? BUILTIN_DEFAULT_TEMPLATE_ID,
  };
}

/**
 * Ensures each slide has a generation snapshot on classroom load (not on template apply).
 */
export function ensureGenerationSnapshotsOnLoad(scenes: readonly Scene[]): Scene[] {
  return scenes.map((scene) => {
    if (scene.type !== 'slide') return scene;

    const content = scene.content as SlideContent;
    if (!slideContentNeedsGenerationSnapshot(content)) {
      return scene;
    }

    return {
      ...scene,
      content: {
        ...content,
        ...captureGenerationSnapshotFields(content),
      },
    };
  });
}

/** @deprecated Use {@link ensureGenerationSnapshotsOnLoad} on load paths only. */
export function backfillGenerationSnapshotsForScenes(scenes: readonly Scene[]): Scene[] {
  return ensureGenerationSnapshotsOnLoad(scenes);
}

/**
 * Pins `generationSnapshot` to the server file canvas (first-generation baseline).
 * Call on studio load and before restore so colors/fonts always match saved generation output.
 */
export function seedAuthoritativeGenerationSnapshotsFromServer(
  targetScenes: readonly Scene[],
  serverScenes: readonly Scene[],
): Scene[] {
  const serverById = new Map(serverScenes.map((scene) => [scene.id, scene]));

  return targetScenes.map((scene) => {
    if (scene.type !== 'slide') return scene;

    const serverScene = serverById.get(scene.id);
    if (!serverScene || serverScene.type !== 'slide') return scene;

    const localContent = scene.content as SlideContent;
    const serverContent = serverScene.content as SlideContent;

    const baselineSnapshot =
      serverContent.generationSnapshot &&
      isTrustedGenerationBaselineTheme(serverContent.generationSnapshot.theme)
        ? cloneSlideCanvas(serverContent.generationSnapshot)
        : isDefaultGenerationDisplayTheme(serverContent.canvas.theme)
          ? cloneSlideCanvas(serverContent.canvas)
          : null;

    if (!baselineSnapshot) {
      return scene;
    }

    return {
      ...scene,
      content: {
        ...localContent,
        generationSnapshot: baselineSnapshot,
        generationSlideTemplateId:
          serverContent.generationSlideTemplateId ?? BUILTIN_DEFAULT_TEMPLATE_ID,
      },
    };
  });
}

/**
 * Copies generation snapshots from `sourceScenes` into `targetScenes` when the target needs repair.
 * Used when studio hydrates from IndexedDB but the server still has the original office canvas.
 */
export function mergeGenerationSnapshotsFromServer(
  targetScenes: readonly Scene[],
  sourceScenes: readonly Scene[],
): Scene[] {
  const sourceById = new Map(sourceScenes.map((scene) => [scene.id, scene]));

  return targetScenes.map((scene) => {
    if (scene.type !== 'slide') return scene;

    const content = scene.content as SlideContent;
    if (!slideContentNeedsGenerationSnapshot(content)) {
      return scene;
    }

    const serverScene = sourceById.get(scene.id);
    if (!serverScene || serverScene.type !== 'slide') {
      return {
        ...scene,
        content: {
          ...content,
          ...captureGenerationSnapshotFields(content),
        },
      };
    }

    const serverContent = serverScene.content as SlideContent;
    if (!slideContentNeedsGenerationSnapshot(serverContent)) {
      return {
        ...scene,
        content: {
          ...content,
          generationSnapshot: serverContent.generationSnapshot
            ? cloneSlideCanvas(serverContent.generationSnapshot)
            : content.generationSnapshot,
          generationSlideTemplateId:
            serverContent.generationSlideTemplateId ?? content.generationSlideTemplateId,
        },
      };
    }

    return {
      ...scene,
      content: {
        ...content,
        ...captureGenerationSnapshotFields(serverContent),
      },
    };
  });
}
