/**
 * @extends-from lib/generation/pipeline-default-slide-theme.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import {
  UPSTREAM_OFFICE_OUTLINE,
  UPSTREAM_OFFICE_SHADOW,
  UPSTREAM_OFFICE_SLIDE_THEME,
  UPSTREAM_OFFICE_THEME_COLORS,
} from '@/lib/slide-templates/default-office-theme';
import { BUILTIN_DEFAULT_TEMPLATE_ID } from '@/lib/slide-templates/constants';
import type { ResolvedSlideTemplate } from '@/lib/slide-templates/types';
import type { SlideTheme } from '@/lib/types/slides';

const PIPELINE_DEFAULT_SLIDE_THEME_VALUES = {
  backgroundColor: UPSTREAM_OFFICE_SLIDE_THEME.backgroundColor,
  themeColors: [...UPSTREAM_OFFICE_THEME_COLORS],
  fontColor: UPSTREAM_OFFICE_SLIDE_THEME.fontColor,
  fontName: UPSTREAM_OFFICE_SLIDE_THEME.fontName,
  outline: { ...UPSTREAM_OFFICE_OUTLINE },
  shadow: { ...UPSTREAM_OFFICE_SHADOW },
} satisfies SlideTheme;

/**
 * Immutable slide theme used by the generation pipeline when no custom template applies.
 * Sourced from upstream `scene-builder.ts` — template edits must not mutate this object.
 */
export const PIPELINE_DEFAULT_SLIDE_THEME: SlideTheme = Object.freeze(
  PIPELINE_DEFAULT_SLIDE_THEME_VALUES,
);

/** Mutable copy for assignment on slide canvases (avoids sharing frozen refs). */
export function clonePipelineDefaultSlideTheme(): SlideTheme {
  const { outline, shadow } = PIPELINE_DEFAULT_SLIDE_THEME_VALUES;
  return {
    backgroundColor: PIPELINE_DEFAULT_SLIDE_THEME_VALUES.backgroundColor,
    themeColors: [...PIPELINE_DEFAULT_SLIDE_THEME_VALUES.themeColors],
    fontColor: PIPELINE_DEFAULT_SLIDE_THEME_VALUES.fontColor,
    fontName: PIPELINE_DEFAULT_SLIDE_THEME_VALUES.fontName,
    outline: { color: outline.color, width: outline.width, style: outline.style },
    shadow: { h: shadow.h, v: shadow.v, blur: shadow.blur, color: shadow.color },
  };
}

export function isPipelineDefaultTemplateId(templateId: string | undefined): boolean {
  return !templateId || templateId === BUILTIN_DEFAULT_TEMPLATE_ID;
}

/** True when theme matches the frozen generation pipeline baseline (upstream Office). */
export function isPipelineDefaultSlideTheme(theme: SlideTheme): boolean {
  const baseline = PIPELINE_DEFAULT_SLIDE_THEME;
  return (
    theme.backgroundColor === baseline.backgroundColor &&
    theme.fontColor === baseline.fontColor &&
    theme.fontName === baseline.fontName &&
    theme.themeColors.join(',') === baseline.themeColors.join(',') &&
    theme.outline?.color === baseline.outline?.color &&
    theme.outline?.width === baseline.outline?.width &&
    theme.outline?.style === baseline.outline?.style
  );
}

export interface PipelineSlideAssemblyOptions {
  readonly slideTheme?: SlideTheme;
  readonly resolvedTemplate?: ResolvedSlideTemplate;
}

/** True when generation should use legacy pipeline assembly (theme only, no element remap). */
export function usesPipelineDefaultSlideAssembly(
  options?: PipelineSlideAssemblyOptions,
): boolean {
  if (options?.slideTheme) {
    return false;
  }
  return isPipelineDefaultTemplateId(options?.resolvedTemplate?.record.id);
}
