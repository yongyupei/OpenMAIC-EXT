/**
 * @extends-from lib/slide-templates/palette-utils.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import tinycolor from 'tinycolor2';

import type { SlideTheme } from '@/lib/types/slides';

/** Resolves mix ratio so blocks stay hue-distinct yet keep light body text readable on dark canvases. */
export function resolveDarkBlockMixRatio(accent: string, slotIndex = 0): number {
  const luminance = tinycolor(accent).getLuminance();
  let ratio: number;
  if (luminance > 0.45) ratio = 65;
  else if (luminance > 0.35) ratio = 58;
  else if (luminance > 0.25) ratio = 52;
  else if (luminance > 0.12) ratio = 46;
  else ratio = 42;
  // Stagger slots so adjacent blocks don't collapse to the same depth.
  const slotOffset = [0, 3, -2, 4, -1][slotIndex % 5] ?? 0;
  return Math.min(68, Math.max(38, ratio + slotOffset));
}

/** When an accent is near-neutral, borrow hue from the template primary at a wheel offset. */
function resolveBlockAccentHue(
  accent: string,
  index: number,
  primaryAccent: string,
): string {
  const hsl = tinycolor(accent).toHsl();
  if (hsl.s >= 0.06) return accent;
  const spin = [0, 72, 144, 216, 288][index % 5] ?? 0;
  return tinycolor(primaryAccent).spin(spin).saturate(18).toHexString();
}

/** Outline accent derived from a tinted block fill — keeps stroke paired with its panel hue. */
export function accentFromContentBlockFill(fill: string, fallbackAccent: string): string {
  const fillColor = tinycolor(fill);
  if (!fillColor.isValid()) return fallbackAccent;
  const { s } = fillColor.toHsl();
  if (s < 0.08) return fallbackAccent;
  return fillColor.clone().saturate(22).lighten(10).toHexString();
}

/**
 * Builds visibly distinct content-block fills on dark slides — each slot keeps its accent hue
 * while remaining dark enough for light typography (unlike flat 72% mixes that look identical).
 */
export function mixDistinctContentBlockFills(
  backgroundColor: string,
  accentHues: readonly string[],
  options: { primaryAccent?: string } = {},
): string[] {
  const primaryAccent =
    options.primaryAccent ??
    accentHues.find((color) => tinycolor(color).toHsl().s >= 0.2) ??
    accentHues[0]!;

  return accentHues.map((accent, index) => {
    const resolvedAccent = resolveBlockAccentHue(accent, index, primaryAccent);
    const mixed = tinycolor.mix(
      resolvedAccent,
      backgroundColor,
      resolveDarkBlockMixRatio(resolvedAccent, index),
    );
    const vividSlots = new Set([0, 2, 4]);
    const toned = vividSlots.has(index) ? mixed.saturate(6) : mixed.saturate(3);
    return toned.desaturate(4).toHexString();
  });
}

/**
 * Builds content-block fills from distinct accent hues, mixed into the slide background
 * so blocks stay readable on dark (or light) canvases while preserving multi-color identity.
 */
export function mixContentBlockFills(
  backgroundColor: string,
  accentHues: readonly string[],
  mixRatio = 62,
): string[] {
  if (tinycolor(backgroundColor).isDark()) {
    return mixDistinctContentBlockFills(backgroundColor, accentHues);
  }
  return accentHues.map((accent) =>
    tinycolor.mix(accent, backgroundColor, mixRatio).desaturate(4).toHexString(),
  );
}

/** Light-template pastel blocks: soft tints per accent hue (Office card reference style). */
export function mixLightContentBlockFills(accentHues: readonly string[]): string[] {
  return accentHues.map((accent) =>
    tinycolor.mix(accent, '#ffffff', 86).desaturate(8).toHexString(),
  );
}

/** Executive dark cards: slightly brighter hue panels for premium depth (falls back if contrast fails). */
export function mixPremiumDarkCardFills(
  backgroundColor: string,
  accentHues: readonly string[],
): string[] {
  const distinct = mixDistinctContentBlockFills(backgroundColor, accentHues);
  return distinct.map((fill, index) => {
    const accent = accentHues[index % accentHues.length]!;
    const lifted = tinycolor(fill).lighten(3).saturate(6);
    const bodyProbe = tinycolor.mostReadable(lifted.toHexString(), ['#f1f5f9', '#d4d4d4', '#cbd5e1']);
    if (tinycolor.readability(bodyProbe.toHexString(), lifted.toHexString()) >= 4.5) {
      return lifted.toHexString();
    }
    return fill;
  });
}

/** Office-style card pastels — for light canvases / upstream default only. */
export function mixReferenceCardFills(accentHues: readonly string[]): string[] {
  return mixLightContentBlockFills(accentHues);
}

/** Dark readable text on a pastel card (light canvas only). */
export function cardTextColorForAccent(accent: string): string {
  const base = tinycolor(accent).darken(42).saturate(12);
  if (tinycolor.readability(base.toHexString(), mixLightContentBlockFills([accent])[0]!) >= 4.5) {
    return base.toHexString();
  }
  return tinycolor(accent).darken(52).desaturate(5).toHexString();
}

/** Reference card accent order: blue · green · orange · purple · indigo. */
export const REFERENCE_CARD_ACCENT_HUES = [
  '#2563eb',
  '#16a34a',
  '#ea580c',
  '#9333ea',
  '#6366f1',
] as const;

/** Left accent rail — vivid but not neon on dark canvases. */
export function softenAccentForRail(accent: string): string {
  return tinycolor(accent).desaturate(12).lighten(10).toHexString();
}

/** Card title — lighter, softer accent that stays readable on tinted panels. */
export function softAccentForPanelHeading(accent: string, panelFill: string): string {
  let candidate = tinycolor(accent).desaturate(16).lighten(18);
  for (let step = 0; step < 5 && tinycolor.readability(candidate.toHexString(), panelFill) < 3.2; step++) {
    candidate = candidate.lighten(3);
  }
  return candidate.toHexString();
}

/** Card body — slightly muted vs canvas body for visual hierarchy. */
export function softBodyColorForPanel(bodyFontColor: string): string {
  return tinycolor.mix(bodyFontColor, '#94a3b8', 10).desaturate(6).toHexString();
}

/** Panel border — accent blended into fill, low contrast for calm edges. */
export function harmonizePanelBorderColor(accent: string, fill: string): string {
  return tinycolor.mix(accent, fill, 75).setAlpha(0.32).toRgbString();
}

/** Subtle vertical lift on executive card panels. */
export function buildPremiumPanelGradient(fill: string): {
  type: 'linear';
  colors: { pos: number; color: string }[];
  rotate: number;
} {
  return {
    type: 'linear',
    colors: [
      { pos: 0, color: tinycolor(fill).lighten(6).desaturate(5).toHexString() },
      { pos: 100, color: tinycolor(fill).darken(2).toHexString() },
    ],
    rotate: 180,
  };
}

/** Coordinated chart + theme accent strip (same hue order as content blocks). */
export function coordinatedAccentPalette(accentHues: readonly string[]): string[] {
  return [...accentHues];
}

export function buildCoordinatedGraphics(
  backgroundColor: string,
  accentHues: readonly string[],
  options: {
    mixRatio?: number;
    mutedMixRatio?: number;
    lineAccent?: string;
    outlineAccent?: string;
    light?: boolean;
  } = {},
): Pick<
  SlideTheme,
  'contentBlockColors' | 'mutedBlockFill' | 'chartColors' | 'lineColor' | 'blockOutlineColor'
> {
  const {
    mixRatio = 62,
    mutedMixRatio = 14,
    lineAccent = accentHues[0]!,
    outlineAccent = accentHues[1] ?? accentHues[0]!,
    light = false,
  } = options;

  const contentBlockColors = light
    ? mixLightContentBlockFills(accentHues)
    : mixContentBlockFills(backgroundColor, accentHues, mixRatio);

  const mutedBlockFill = light
    ? tinycolor.mix(backgroundColor, '#f1f5f9', 35).toHexString()
    : tinycolor.mix(backgroundColor, accentHues[0]!, mutedMixRatio).toHexString();

  return {
    contentBlockColors,
    mutedBlockFill,
    chartColors: coordinatedAccentPalette(accentHues),
    lineColor: lineAccent,
    blockOutlineColor: outlineAccent,
  };
}
