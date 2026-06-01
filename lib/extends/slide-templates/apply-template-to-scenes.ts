/**
 * @extends-from lib/slide-templates/apply-template-to-scenes.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import {
  clonePipelineDefaultSlideTheme,
  isPipelineDefaultSlideTheme,
  PIPELINE_DEFAULT_SLIDE_THEME,
} from '@/lib/generation/pipeline-default-slide-theme';
import {
  cloneSlideCanvas,
  isTrustedGenerationBaselineTheme,
} from '@/lib/generation/slide-generation-snapshot';
import {
  cloneUpstreamFormatTheme,
  isClassicOfficeSlideTheme,
} from '@/lib/slide-templates/default-office-theme';
import type { PPTElement, Slide, SlideTheme } from '@/lib/types/slides';
import type { Scene, SlideContent } from '@/lib/types/stage';
import { forceRestoreSlideToTemplate } from '@/lib/slide-templates/force-restore-template';
import { applyThemeGraphicsToCanvas } from '@/lib/slide-templates/theme-graphics';
import { applyCardAwareTypographyToCanvas, applyThemeTypographyToCanvas } from '@/lib/slide-templates/theme-typography';

/** Baseline palette for raw AI elements — frozen pipeline default, not editable templates. */
export const PIPELINE_GENERATION_BASELINE_THEME = PIPELINE_DEFAULT_SLIDE_THEME;

export { buildThemeColorRemap, remapHtmlThemeColors } from '@/lib/slide-templates/theme-color-remap';
export {
  applyThemeTypographyToCanvas,
  applyCardAwareTypographyToCanvas,
  applyThemeTypographyToElement,
  applyThemeTypographyToElements,
  resolveSlideThemeTypography,
  resolveTextColorForTextType,
  remapHtmlTypography,
} from '@/lib/slide-templates/theme-typography';
export {
  applyThemeGraphicsToCanvas,
  applyThemeGraphicsToElement,
  applyThemeGraphicsToElements,
  buildGraphicsColorRemap,
  closestContentBlockIndex,
  deriveContentBlockColors,
  forceApplyThemeGraphicsToCanvas,
  forceApplyThemeGraphicsToElement,
  forceApplyThemeGraphicsToElements,
  resolveSlideThemeGraphics,
} from '@/lib/slide-templates/theme-graphics';
export { forceRestoreSlideToTemplate, forceRestoreElement } from '@/lib/slide-templates/force-restore-template';
export {
  forceApplyThemeTypographyToCanvas,
  forceApplyThemeTypographyToElement,
  forceHtmlTextTypography,
} from '@/lib/slide-templates/theme-typography';
export { forceHtmlTextStyles, resolveForceTextStyle } from '@/lib/slide-templates/theme-force-styles';

function isDefaultGenerationDisplayTheme(theme: SlideTheme): boolean {
  return isPipelineDefaultSlideTheme(theme) || isClassicOfficeSlideTheme(theme);
}

/**
 * Restores pipeline default from snapshot baseline (theme + background, elements unchanged).
 */
export function applyPipelineDefaultToCanvas(canvas: Slide): Slide {
  return restoreDefaultCanvasFromBaseline(canvas, canvas.id);
}

/** Full template apply: background, theme, typography, and shape/chart colors. */
export function applySlideTemplateToCanvas(slide: Slide, newTheme: SlideTheme): Slide {
  const priorTheme = slide.theme;
  const targetTheme = cloneUpstreamFormatTheme(newTheme);
  const withGraphics = applyThemeGraphicsToCanvas(slide, targetTheme, priorTheme);
  const withTypography = applyCardAwareTypographyToCanvas(withGraphics, targetTheme);

  return {
    ...withTypography,
    theme: targetTheme,
    background: { type: 'solid', color: targetTheme.backgroundColor },
  };
}

/**
 * Forces the target template onto the canvas without remapping from the prior theme.
 * Used when restoring the default template so all colors/fonts match the builtin exactly.
 */
export function forceApplySlideTemplateToCanvas(slide: Slide, newTheme: SlideTheme): Slide {
  return forceRestoreSlideToTemplate(slide, newTheme);
}

export interface ApplySlideTemplateThemeOptions {
  /** When true, overwrite styles from the target theme only (no palette remapping). */
  readonly force?: boolean;
}

export interface AssembleSlideCanvasOptions {
  readonly id?: string;
  readonly background?: Slide['background'];
  /**
   * Palette to remap from. Generation pipeline always uses OFFICE baseline;
   * editor "reset to default" uses the slide's current canvas theme.
   */
  readonly sourceTheme?: SlideTheme;
}

/**
 * Builds a slide canvas the same way as `buildCompleteScene` in scene-assembler:
 * remaps elements from `sourceTheme` onto `targetTheme`.
 */
export function assembleSlideCanvas(
  elements: readonly PPTElement[],
  targetTheme: SlideTheme,
  options: AssembleSlideCanvasOptions = {},
): Slide {
  const sourceTheme = options.sourceTheme ?? PIPELINE_GENERATION_BASELINE_THEME;
  const slideForRemap: Slide = {
    id: options.id ?? 'assemble',
    viewportSize: 1000,
    viewportRatio: 0.5625,
    theme: sourceTheme,
    elements: [...elements],
  };
  const themed = applySlideTemplateToCanvas(slideForRemap, targetTheme);

  return {
    ...themed,
    id: options.id ?? themed.id,
    background:
      options.background ?? { type: 'solid', color: targetTheme.backgroundColor },
  };
}

/** Applies template theme to slide elements (e.g. on first generation). */
export function applyThemeToSlideElements(
  elements: readonly PPTElement[],
  newTheme: SlideTheme,
  oldTheme?: SlideTheme,
): PPTElement[] {
  return assembleSlideCanvas(elements, newTheme, {
    sourceTheme: oldTheme ?? PIPELINE_GENERATION_BASELINE_THEME,
  }).elements;
}

/** Generation-only: assign upstream theme metadata without remapping (matches scene-builder). */
export function applyUpstreamFormatThemeToCanvas(slide: Slide, theme: SlideTheme): Slide {
  return {
    ...slide,
    theme: cloneUpstreamFormatTheme(theme),
  };
}

function resolveTemplateRemapSourceTheme(baseline: Slide): SlideTheme {
  return isPipelineDefaultSlideTheme(baseline.theme) || isClassicOfficeSlideTheme(baseline.theme)
    ? PIPELINE_GENERATION_BASELINE_THEME
    : baseline.theme;
}

function restoreDefaultCanvasFromBaseline(baseline: Slide, canvasId: string): Slide {
  const theme = clonePipelineDefaultSlideTheme();
  const background = { type: 'solid' as const, color: theme.backgroundColor };

  if (isTrustedGenerationBaselineTheme(baseline.theme)) {
    return {
      ...cloneSlideCanvas(baseline),
      id: canvasId,
      theme,
      background,
    };
  }

  return assembleSlideCanvas(baseline.elements, theme, {
    id: canvasId,
    sourceTheme: baseline.theme,
    background,
  });
}

function resolveRestoredGenerationSnapshot(
  content: SlideContent,
  sourceSlide: Slide,
  restoredCanvas: Slide,
): Slide {
  const existing = content.generationSnapshot;
  if (existing && isTrustedGenerationBaselineTheme(existing.theme)) {
    return cloneSlideCanvas(existing);
  }
  if (isTrustedGenerationBaselineTheme(sourceSlide.theme)) {
    return cloneSlideCanvas(sourceSlide);
  }
  return cloneSlideCanvas({
    ...restoredCanvas,
    theme: clonePipelineDefaultSlideTheme(),
  });
}

/** Immutable pipeline-baseline slide used as the source for every template switch. */
export function resolveGenerationBaselineSlide(
  content: SlideContent,
  authoritativeContent?: SlideContent,
): Slide {
  if (content.generationSnapshot) {
    const snapshot = content.generationSnapshot;
    if (isTrustedGenerationBaselineTheme(snapshot.theme)) {
      return cloneSlideCanvas(snapshot);
    }
    return restoreDefaultCanvasFromBaseline(snapshot, snapshot.id);
  }
  if (authoritativeContent?.generationSnapshot) {
    const snapshot = authoritativeContent.generationSnapshot;
    if (isTrustedGenerationBaselineTheme(snapshot.theme)) {
      return cloneSlideCanvas(snapshot);
    }
    return restoreDefaultCanvasFromBaseline(snapshot, snapshot.id);
  }

  if (isDefaultGenerationDisplayTheme(content.canvas.theme)) {
    return cloneSlideCanvas(content.canvas);
  }
  if (
    authoritativeContent?.canvas &&
    isDefaultGenerationDisplayTheme(authoritativeContent.canvas.theme)
  ) {
    return cloneSlideCanvas(authoritativeContent.canvas);
  }

  const fallback = authoritativeContent?.canvas ?? content.canvas;
  if (isTrustedGenerationBaselineTheme(fallback.theme)) {
    return cloneSlideCanvas(fallback);
  }
  return restoreDefaultCanvasFromBaseline(fallback, fallback.id);
}

function applySlideTemplateFromBaseline(
  baseline: Slide,
  canvasId: string,
  targetTheme: SlideTheme,
  options?: { readonly force?: boolean },
): Slide {
  const normalizedTarget = cloneUpstreamFormatTheme(targetTheme);

  if (options?.force) {
    return forceApplySlideTemplateToCanvas({ ...baseline, id: canvasId }, normalizedTarget);
  }

  if (isClassicOfficeSlideTheme(normalizedTarget)) {
    return restoreDefaultCanvasFromBaseline(baseline, canvasId);
  }

  return assembleSlideCanvas(baseline.elements, normalizedTarget, {
    id: canvasId,
    sourceTheme: resolveTemplateRemapSourceTheme(baseline),
    background: { type: 'solid', color: normalizedTarget.backgroundColor },
  });
}

/** Applies a template from the generation snapshot with full visual styling. */
export function applySlideTemplateFromGenerationBaseline(
  content: SlideContent,
  targetTheme: SlideTheme,
  options?: { readonly force?: boolean; readonly authoritativeContent?: SlideContent },
): Slide {
  const baseline = resolveGenerationBaselineSlide(content, options?.authoritativeContent);
  return applySlideTemplateFromBaseline(baseline, content.canvas.id, targetTheme, options);
}

/** Baseline slide used before re-rendering onto the pipeline default theme. */
export function resolveDefaultProfessionalRestoreSource(
  content: SlideContent,
  authoritativeContent?: SlideContent,
): Slide {
  if (content.generationSnapshot) {
    const snapshot = content.generationSnapshot;
    if (isTrustedGenerationBaselineTheme(snapshot.theme)) {
      return cloneSlideCanvas(snapshot);
    }
    return restoreDefaultCanvasFromBaseline(snapshot, snapshot.id);
  }
  if (authoritativeContent?.generationSnapshot) {
    const snapshot = authoritativeContent.generationSnapshot;
    if (isTrustedGenerationBaselineTheme(snapshot.theme)) {
      return cloneSlideCanvas(snapshot);
    }
    return restoreDefaultCanvasFromBaseline(snapshot, snapshot.id);
  }
  if (authoritativeContent?.canvas) {
    const canvas = authoritativeContent.canvas;
    if (isTrustedGenerationBaselineTheme(canvas.theme)) {
      return cloneSlideCanvas(canvas);
    }
    return restoreDefaultCanvasFromBaseline(canvas, canvas.id);
  }
  if (isTrustedGenerationBaselineTheme(content.canvas.theme)) {
    return cloneSlideCanvas(content.canvas);
  }
  return restoreDefaultCanvasFromBaseline(content.canvas, content.canvas.id);
}

/**
 * Restores one slide canvas to first-generation appearance from the generation snapshot.
 */
export function restoreSlideCanvasToGenerationBaseline(
  content: SlideContent,
  authoritativeContent?: SlideContent,
): Slide {
  const sourceSlide = resolveDefaultProfessionalRestoreSource(content, authoritativeContent);
  return restoreDefaultCanvasFromBaseline(sourceSlide, content.canvas.id);
}

/** @deprecated Prefer {@link restoreScenesToPipelineDefaultTheme} for full scene restore. */
export function restoreCanvasToPipelineDefault(canvas: Slide): Slide {
  return restoreDefaultCanvasFromBaseline(canvas, canvas.id);
}

/** Restores slides to upstream Office baseline from the generation snapshot. */
export function restoreScenesToPipelineDefaultTheme(
  scenes: readonly Scene[],
  scopeSceneIds?: ReadonlySet<string> | null,
  authoritativeScenes?: readonly Scene[],
): Scene[] {
  const authoritativeById = authoritativeScenes
    ? new Map(authoritativeScenes.map((scene) => [scene.id, scene]))
    : null;

  return scenes.map((scene) => {
    if (scene.type !== 'slide') return scene;
    if (scopeSceneIds && !scopeSceneIds.has(scene.id)) return scene;

    const content = scene.content as SlideContent;
    const authScene = authoritativeById?.get(scene.id);
    const authContent =
      authScene?.type === 'slide' ? (authScene.content as SlideContent) : undefined;

    const sourceSlide = resolveDefaultProfessionalRestoreSource(content, authContent);
    const canvas = restoreDefaultCanvasFromBaseline(sourceSlide, content.canvas.id);
    const generationSnapshot = resolveRestoredGenerationSnapshot(content, sourceSlide, canvas);

    return {
      ...scene,
      content: {
        ...content,
        canvas,
        generationSnapshot,
      },
      updatedAt: Date.now(),
    };
  });
}

/** Template id stored at generation for scenes in scope (for project/chapter reset). */
export function resolveGenerationSlideTemplateIdForRestore(
  scenes: readonly Scene[],
  scopeSceneIds?: ReadonlySet<string> | null,
): string | undefined {
  for (const scene of scenes) {
    if (scene.type !== 'slide') continue;
    if (scopeSceneIds && !scopeSceneIds.has(scene.id)) continue;
    const templateId = (scene.content as SlideContent).generationSlideTemplateId;
    if (templateId) return templateId;
  }
  return undefined;
}

/** Applies a slide template theme to slide scenes in the stage store. */
export function applySlideTemplateThemeToScenes(
  scenes: readonly Scene[],
  theme: SlideTheme,
  scopeSceneIds?: ReadonlySet<string> | null,
  options?: ApplySlideTemplateThemeOptions,
): Scene[] {
  return scenes.map((scene) => {
    if (scene.type !== 'slide') return scene;
    if (scopeSceneIds && !scopeSceneIds.has(scene.id)) return scene;

    const content = scene.content as SlideContent;
    const baseline = resolveGenerationBaselineSlide(content);
    const generationSnapshot =
      content.generationSnapshot && isTrustedGenerationBaselineTheme(content.generationSnapshot.theme)
        ? cloneSlideCanvas(content.generationSnapshot)
        : cloneSlideCanvas(baseline);

    return {
      ...scene,
      content: {
        ...content,
        canvas: applySlideTemplateFromBaseline(
          baseline,
          content.canvas.id,
          theme,
          { force: options?.force },
        ),
        generationSnapshot,
      },
      updatedAt: Date.now(),
    };
  });
}
