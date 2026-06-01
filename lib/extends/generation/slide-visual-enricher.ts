/**
 * Post-generation visual enricher — minimal editorial slides via coordinated color + canvas.
 * Adds at most a few subtle structure layers; normalizes text colors to the active theme.
 */
import { nanoid } from 'nanoid';
import tinycolor from 'tinycolor2';

import { clonePipelineDefaultSlideTheme } from '@/lib/generation/pipeline-default-slide-theme';
import { isDarkSlideBackground } from '@/lib/slide-templates/generation-design-guide';
import { resolveSlideThemeGraphics } from '@/lib/slide-templates/theme-graphics';
import {
  forceApplyThemeTypographyToElement,
  inferTextType,
  resolveSlideThemeTypography,
} from '@/lib/slide-templates/theme-typography';
import type { GeneratedSlideContent, SceneOutline } from '@/lib/types/generation';
import type { Gradient, PPTElement, PPTShapeElement, SlideBackground, SlideTheme } from '@/lib/types/slides';

const CANVAS_W = 1000;
const CANVAS_H = 562.5;
const CONTENT_LEFT = 72;

function rectShape(
  left: number,
  top: number,
  width: number,
  height: number,
  fill: string,
): PPTShapeElement {
  return {
    type: 'shape',
    id: `shape_${nanoid(8)}`,
    left,
    top,
    width,
    height,
    rotate: 0,
    viewBox: [width, height],
    path: `M0 0 L${width} 0 L${width} ${height} L0 ${height} Z`,
    fixedRatio: false,
    fill,
  };
}

/** Barely-there canvas wash — readability first, no loud gradients. */
function buildCleanBackground(theme: SlideTheme, dark: boolean): SlideBackground {
  const base = theme.backgroundColor;
  if (dark) {
    const gradient: Gradient = {
      type: 'linear',
      rotate: 180,
      colors: [
        { pos: 0, color: tinycolor(base).lighten(2).toHexString() },
        { pos: 100, color: base },
      ],
    };
    return { type: 'gradient', gradient };
  }

  const gradient: Gradient = {
    type: 'linear',
    rotate: 180,
    colors: [
      { pos: 0, color: '#ffffff' },
      { pos: 100, color: tinycolor.mix(base, '#f1f5f9', 55).toHexString() },
    ],
  };
  return { type: 'gradient', gradient };
}

function hasAccentUnderline(elements: readonly PPTElement[]): boolean {
  return elements.some(
    (el) =>
      el.type === 'shape' &&
      el.height <= 4 &&
      el.width >= 32 &&
      el.width <= 120 &&
      el.top >= 100 &&
      el.top <= 140,
  );
}

function hasContentPanel(elements: readonly PPTElement[]): boolean {
  return elements.some(
    (el) =>
      el.type === 'shape' &&
      el.left >= CONTENT_LEFT - 8 &&
      el.left <= CONTENT_LEFT + 8 &&
      el.top >= 128 &&
      el.width >= 800 &&
      el.height >= 280,
  );
}

/** Single accent underline beneath the title band. */
function buildTitleAccentLine(theme: SlideTheme, dark: boolean): PPTElement {
  const accent = theme.accentFontColor ?? theme.themeColors[0] ?? theme.fontColor;
  const fill = dark
    ? tinycolor(accent).desaturate(8).toHexString()
    : tinycolor(accent).desaturate(12).toHexString();
  return rectShape(CONTENT_LEFT, 118, 56, 3, fill);
}

/** Soft content panel — one muted surface, no borders. */
function buildContentPanel(theme: SlideTheme, dark: boolean): PPTElement {
  const graphics = resolveSlideThemeGraphics(theme);
  let fill = graphics.mutedBlockFill;
  if (dark) {
    fill = tinycolor.mix(theme.backgroundColor, theme.themeColors[0] ?? '#334155', 10).toHexString();
  } else {
    fill = tinycolor.mix('#ffffff', graphics.mutedBlockFill, 65).toHexString();
  }
  return rectShape(CONTENT_LEFT - 12, 132, 856, 368, fill);
}

function normalizeTextElements(elements: PPTElement[], theme: SlideTheme): PPTElement[] {
  const typography = resolveSlideThemeTypography(theme);
  return elements.map((el) => {
    if (el.type !== 'text') return el;
    const withType = el.textType ? el : { ...el, textType: inferTextType(el) };
    return forceApplyThemeTypographyToElement(withType, typography);
  });
}

export interface SlideVisualEnricherOptions {
  readonly theme?: SlideTheme;
  readonly layoutId?: string;
  /** @deprecated KPI pills removed — minimal layout only */
  readonly skipKpiPills?: boolean;
}

/**
 * Applies a restrained editorial layout: subtle canvas, one accent line, optional soft panel,
 * and theme-coherent typography on all text elements.
 */
export function enrichGeneratedSlideContent(
  content: GeneratedSlideContent,
  outline: SceneOutline,
  options: SlideVisualEnricherOptions = {},
): GeneratedSlideContent {
  const theme = options.theme ?? clonePipelineDefaultSlideTheme();
  const dark = isDarkSlideBackground(theme.backgroundColor);
  const existing = content.elements;
  const prepend: PPTElement[] = [];

  const background =
    !content.background || content.background.type === 'solid'
      ? buildCleanBackground(theme, dark)
      : content.background;

  const hasBullets = (outline.keyPoints?.length ?? 0) >= 1;
  const isCover = outline.suggestedLayoutId === 'cover';

  if (!isCover && !hasContentPanel([...prepend, ...existing]) && hasBullets) {
    prepend.push(buildContentPanel(theme, dark));
  }

  if (!isCover && !hasAccentUnderline([...prepend, ...existing])) {
    prepend.push(buildTitleAccentLine(theme, dark));
  }

  const merged = normalizeTextElements([...prepend, ...existing], theme);

  return {
    ...content,
    background,
    elements: merged,
  };
}
