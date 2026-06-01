/**
 * @extends-from lib/generation/pipeline-slide-canvas.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { nanoid } from 'nanoid';

import {
  clonePipelineDefaultSlideTheme,
  type PipelineSlideAssemblyOptions,
  usesPipelineDefaultSlideAssembly,
} from '@/lib/generation/pipeline-default-slide-theme';
import {
  buildSlideContentWithPipelineGenerationSnapshot,
  cloneSlideCanvas,
} from '@/lib/generation/slide-generation-snapshot';
import { assembleSlideCanvas } from '@/lib/slide-templates/apply-template-to-scenes';
import { cloneUpstreamFormatTheme } from '@/lib/slide-templates/default-office-theme';
import { PIPELINE_DEFAULT_SLIDE_THEME } from '@/lib/generation/pipeline-default-slide-theme';
import type { GeneratedSlideContent, SceneOutline } from '@/lib/types/generation';
import type { PPTElement, Slide, SlideTheme } from '@/lib/types/slides';
import type { SlideContent } from '@/lib/types/stage';

export interface BuildPipelineSlideCanvasOptions {
  readonly id?: string;
  readonly background?: Slide['background'];
}

/**
 * Upstream scene-builder parity: assign theme metadata, keep AI elements and background unchanged.
 */
export function buildUpstreamFormatSlideCanvas(
  elements: readonly PPTElement[],
  theme: SlideTheme,
  options: BuildPipelineSlideCanvasOptions = {},
): Slide {
  return {
    id: options.id ?? nanoid(),
    viewportSize: 1000,
    viewportRatio: 0.5625,
    theme: cloneUpstreamFormatTheme(theme),
    elements: [...elements],
    background: options.background,
  };
}

/** Default professional — upstream Office theme, raw AI element colors. */
export function buildPipelineDefaultSlideCanvas(
  elements: readonly PPTElement[],
  options: BuildPipelineSlideCanvasOptions = {},
): Slide {
  return buildUpstreamFormatSlideCanvas(elements, clonePipelineDefaultSlideTheme(), options);
}

export function buildDefaultProfessionalSlidePair(
  elements: readonly PPTElement[],
  options: BuildPipelineSlideCanvasOptions = {},
): { readonly pipeline: Slide; readonly display: Slide } {
  const pipeline = buildPipelineDefaultSlideCanvas(elements, options);
  return { pipeline, display: cloneSlideCanvas(pipeline) };
}

/** Business/custom template — remap AI elements onto template background and palette. */
export function buildThemedSlideCanvas(
  elements: readonly PPTElement[],
  targetTheme: SlideTheme,
  options: BuildPipelineSlideCanvasOptions = {},
): Slide {
  return assembleSlideCanvas(elements, targetTheme, {
    id: options.id ?? nanoid(),
    sourceTheme: PIPELINE_DEFAULT_SLIDE_THEME,
    background: options.background ?? { type: 'solid', color: targetTheme.backgroundColor },
  });
}

/** Assembles slide scene content — all templates follow upstream scene-builder rules. */
export function assembleSlideSceneContent(
  outline: SceneOutline,
  content: GeneratedSlideContent,
  options?: PipelineSlideAssemblyOptions,
): SlideContent {
  const slideCanvasOptions: BuildPipelineSlideCanvasOptions = {
    id: nanoid(),
    background: content.background,
  };

  const slideContent = usesPipelineDefaultSlideAssembly(options)
    ? (() => {
        const { pipeline, display } = buildDefaultProfessionalSlidePair(
          content.elements,
          slideCanvasOptions,
        );
        return buildSlideContentWithPipelineGenerationSnapshot(display, pipeline, options);
      })()
    : (() => {
        const targetTheme = options!.slideTheme ?? options!.resolvedTemplate!.record.theme;
        const canvasId = slideCanvasOptions.id!;
        const pipeline = buildPipelineDefaultSlideCanvas(content.elements, { id: canvasId });
        const display = buildThemedSlideCanvas(content.elements, targetTheme, { id: canvasId });
        return buildSlideContentWithPipelineGenerationSnapshot(display, pipeline, options);
      })();

  const slideOutputFormat =
    outline.slideOutputFormat ?? (content.htmlSlide ? 'html' : undefined);

  if (!content.htmlSlide) {
    return slideContent;
  }

  return {
    ...slideContent,
    htmlSlide: {
      html: content.htmlSlide.html,
      teacherActions: content.htmlSlide.teacherActions,
      aspectRatio: content.htmlSlide.aspectRatio,
    },
    ...(slideOutputFormat ? { slideOutputFormat } : {}),
  };
}
