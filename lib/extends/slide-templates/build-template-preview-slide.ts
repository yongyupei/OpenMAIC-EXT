/**
 * @extends-from lib/slide-templates/build-template-preview-slide.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import tinycolor from 'tinycolor2';

import { SLIDE_CANVAS_HEIGHT, SLIDE_CANVAS_WIDTH } from '@/lib/slide-templates/constants';
import { cloneUpstreamFormatTheme } from '@/lib/slide-templates/default-office-theme';
import {
  harmonizePanelBorderColor,
  softenAccentForRail,
} from '@/lib/slide-templates/palette-utils';
import { resolveSlideThemeGraphics } from '@/lib/slide-templates/theme-graphics';
import { resolveSlideThemeTypography } from '@/lib/slide-templates/theme-typography';
import type { SlideTemplateRecord } from '@/lib/slide-templates/types';
import type { PPTElement, PPTShapeElement, PPTTextElement, Slide } from '@/lib/types/slides';

const PREVIEW_LAYOUT_ID = 'title-bullets';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface TemplatePreviewCopy {
  readonly bullet1: string;
  readonly bullet2: string;
  readonly bullet3: string;
  readonly blocksLabel: string;
}

/** Canvas chrome: accent rail + muted title band to show layered dark-template pairing. */
function buildCanvasChromeShapes(theme: Slide['theme']): PPTShapeElement[] {
  const graphics = resolveSlideThemeGraphics(theme);
  const primary = theme.themeColors[0] ?? theme.fontColor;

  return [
    {
      type: 'shape',
      id: 'preview-accent-rail',
      left: 0,
      top: 0,
      width: 6,
      height: SLIDE_CANVAS_HEIGHT,
      rotate: 0,
      viewBox: [6, SLIDE_CANVAS_HEIGHT] as [number, number],
      path: `M0,0 L6,0 L6,${SLIDE_CANVAS_HEIGHT} Z`,
      fixedRatio: false,
      fill: primary,
    },
    {
      type: 'shape',
      id: 'preview-title-band',
      left: 6,
      top: 0,
      width: SLIDE_CANVAS_WIDTH - 6,
      height: 130,
      rotate: 0,
      viewBox: [SLIDE_CANVAS_WIDTH - 6, 130] as [number, number],
      path: `M0,0 L${SLIDE_CANVAS_WIDTH - 6},0 L${SLIDE_CANVAS_WIDTH - 6},130 Z`,
      fixedRatio: false,
      fill: graphics.mutedBlockFill,
      outline: {
        color: tinycolor(primary).setAlpha(0.35).toRgbString(),
        width: 1,
        style: 'solid' as const,
      },
    },
  ];
}

function buildAccentPreviewShapes(theme: Slide['theme']): PPTShapeElement[] {
  const graphics = resolveSlideThemeGraphics(theme);
  const blocks = graphics.contentBlockColors.slice(0, 5);
  if (blocks.length === 0) return [];

  const blockWidth = 168;
  const blockHeight = 72;
  const stripWidth = 5;
  const gap = 12;
  const totalWidth = blocks.length * blockWidth + (blocks.length - 1) * gap;
  const startLeft = Math.round((SLIDE_CANVAS_WIDTH - totalWidth) / 2);
  const shapes: PPTShapeElement[] = [];

  blocks.forEach((fill, index) => {
    const left = startLeft + index * (blockWidth + gap);
    const accent =
      theme.blockAccentHues?.[index] ?? theme.themeColors[index] ?? theme.themeColors[0] ?? theme.fontColor;
    shapes.push({
      type: 'shape',
      id: `preview-block-${index}`,
      left,
      top: 430,
      width: blockWidth,
      height: blockHeight,
      rotate: 0,
      viewBox: [blockWidth, blockHeight] as [number, number],
      path: `M0,0 L${blockWidth},0 L${blockWidth},${blockHeight} Z`,
      fixedRatio: false,
      fill,
      outline: {
        color: harmonizePanelBorderColor(accent, fill),
        width: 1,
        style: 'solid' as const,
      },
      shadow: theme.shadow,
    });
    shapes.push({
      type: 'shape',
      id: `preview-strip-${index}`,
      left,
      top: 430,
      width: stripWidth,
      height: blockHeight,
      rotate: 0,
      viewBox: [stripWidth, blockHeight] as [number, number],
      path: `M0,0 L${stripWidth},0 L${stripWidth},${blockHeight} Z`,
      fixedRatio: false,
      fill: softenAccentForRail(accent),
    });
  });

  return shapes;
}

/** Preview slide — upstream format with typography, canvas layers, and accent blocks on dark templates. */
export function buildTemplatePreviewSlide(
  template: SlideTemplateRecord,
  copy: TemplatePreviewCopy,
): Slide {
  const theme = cloneUpstreamFormatTheme(template.theme);
  const typography = resolveSlideThemeTypography(theme);
  const isDark = tinycolor(theme.backgroundColor).isDark();
  const layout =
    template.layouts.find((preset) => preset.id === PREVIEW_LAYOUT_ID) ?? template.layouts[0];

  const titleSlot = layout?.slots.find((slot) => slot.role === 'title');
  const bodySlot = layout?.slots.find((slot) => slot.role === 'body');
  const titleName = escapeHtml(template.name);
  const titleSize = isDark ? 32 : 28;
  const bodySize = isDark ? 20 : 18;

  const elements: PPTElement[] = [];

  if (isDark) {
    elements.push(...buildCanvasChromeShapes(theme));
  }

  if (titleSlot) {
    elements.push({
      type: 'text',
      id: 'preview-title',
      left: titleSlot.left,
      top: titleSlot.top,
      width: titleSlot.width,
      height: titleSlot.height,
      rotate: 0,
      content: `<p style="font-size: ${titleSize}px; color: ${typography.titleFontColor}; font-family: ${typography.titleFontName};"><strong>${titleName}</strong></p>`,
      defaultFontName: typography.titleFontName,
      defaultColor: typography.titleFontColor,
      textType: 'title',
    } satisfies PPTTextElement);
  }

  if (bodySlot) {
    const bodyHtml = [copy.bullet1, copy.bullet2, copy.bullet3]
      .map(
        (line) =>
          `<p style="font-size: ${bodySize}px; line-height: 1.5; color: ${typography.bodyFontColor}; font-family: ${typography.bodyFontName};">• ${escapeHtml(line)}</p>`,
      )
      .join('');
    elements.push({
      type: 'text',
      id: 'preview-body',
      left: bodySlot.left,
      top: bodySlot.top,
      width: bodySlot.width,
      height: Math.min(bodySlot.height, 240),
      rotate: 0,
      content: bodyHtml,
      defaultFontName: typography.bodyFontName,
      defaultColor: typography.bodyFontColor,
      textType: 'content',
    } satisfies PPTTextElement);
  }

  if (isDark) {
    elements.push(...buildAccentPreviewShapes(theme));
  }

  return {
    id: `preview-${template.id}`,
    viewportSize: SLIDE_CANVAS_WIDTH,
    viewportRatio: SLIDE_CANVAS_HEIGHT / SLIDE_CANVAS_WIDTH,
    theme,
    background: { type: 'solid', color: theme.backgroundColor },
    elements,
  };
}
