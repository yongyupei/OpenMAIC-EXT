/**
 * @extends-from lib/slide-templates/default-office-theme.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import type { PPTElementShadow, SlideTheme } from '@/lib/types/slides';

/** Extracted from upstream `lib/generation/scene-builder.ts` defaultTheme. */
export const UPSTREAM_OFFICE_THEME_COLORS = [
  '#5b9bd5',
  '#ed7d31',
  '#a5a5a5',
  '#ffc000',
  '#4472c4',
] as const;

export const UPSTREAM_OFFICE_OUTLINE = {
  color: '#d14424',
  width: 2,
  style: 'solid' as const,
};

export const UPSTREAM_OFFICE_SHADOW = {
  h: 0,
  v: 0,
  blur: 10,
  color: '#000000',
};

export const UPSTREAM_OFFICE_THEME_SIGNATURE = UPSTREAM_OFFICE_THEME_COLORS.join(',');

/** Canonical upstream Office slide theme — six fields only, same as scene-builder. */
export const UPSTREAM_OFFICE_SLIDE_THEME: SlideTheme = {
  backgroundColor: '#ffffff',
  themeColors: [...UPSTREAM_OFFICE_THEME_COLORS],
  fontColor: '#333333',
  fontName: 'Microsoft YaHei',
  outline: { ...UPSTREAM_OFFICE_OUTLINE },
  shadow: { ...UPSTREAM_OFFICE_SHADOW },
};

/** @alias UPSTREAM_OFFICE_SLIDE_THEME */
export const CLASSIC_OFFICE_SLIDE_THEME = UPSTREAM_OFFICE_SLIDE_THEME;

/** @alias UPSTREAM_OFFICE_THEME_COLORS */
export const CLASSIC_OFFICE_THEME_COLORS = UPSTREAM_OFFICE_THEME_COLORS;

export const CLASSIC_OFFICE_THEME_SIGNATURE = UPSTREAM_OFFICE_THEME_SIGNATURE;

export interface UpstreamFormatThemeOptions {
  readonly backgroundColor: string;
  readonly fontColor: string;
  readonly themeColors?: readonly string[];
  readonly outlineColor?: string;
  readonly shadow?: PPTElementShadow;
}

/** Business variants: identical upstream shape, palette values only. */
export function buildUpstreamFormatTheme(options: UpstreamFormatThemeOptions): SlideTheme {
  const outline = {
    color: options.outlineColor ?? UPSTREAM_OFFICE_OUTLINE.color,
    width: UPSTREAM_OFFICE_OUTLINE.width,
    style: 'solid' as const,
  };
  const shadow = options.shadow ?? { ...UPSTREAM_OFFICE_SHADOW };

  return cloneSlideThemeCore({
    backgroundColor: options.backgroundColor,
    themeColors: [...(options.themeColors ?? UPSTREAM_OFFICE_THEME_COLORS)],
    fontColor: options.fontColor,
    fontName: 'Microsoft YaHei',
    outline,
    shadow,
  });
}

/** Copies upstream core fields plus optional template extension fields used at apply time. */
function cloneSlideThemeCore(theme: SlideTheme): SlideTheme {
  const outline = theme.outline ?? UPSTREAM_OFFICE_OUTLINE;
  const shadow = theme.shadow ?? UPSTREAM_OFFICE_SHADOW;
  const core: SlideTheme = {
    backgroundColor: theme.backgroundColor,
    themeColors: [...theme.themeColors],
    fontColor: theme.fontColor,
    fontName: theme.fontName,
    outline: { color: outline.color, width: outline.width, style: outline.style },
    shadow: { h: shadow.h, v: shadow.v, blur: shadow.blur, color: shadow.color },
  };

  if (theme.titleFontColor) core.titleFontColor = theme.titleFontColor;
  if (theme.bodyFontColor) core.bodyFontColor = theme.bodyFontColor;
  if (theme.accentFontColor) core.accentFontColor = theme.accentFontColor;
  if (theme.titleFontName) core.titleFontName = theme.titleFontName;
  if (theme.bodyFontName) core.bodyFontName = theme.bodyFontName;
  if (theme.mutedBlockFill) core.mutedBlockFill = theme.mutedBlockFill;
  if (theme.lineColor) core.lineColor = theme.lineColor;
  if (theme.blockOutlineColor) core.blockOutlineColor = theme.blockOutlineColor;
  if (theme.contentBlockColors) core.contentBlockColors = [...theme.contentBlockColors];
  if (theme.blockAccentHues) core.blockAccentHues = [...theme.blockAccentHues];
  if (theme.chartColors) core.chartColors = [...theme.chartColors];

  return core;
}

/** Strips non-upstream runtime noise while preserving template styling fields. */
export function cloneUpstreamFormatTheme(theme: SlideTheme): SlideTheme {
  return cloneSlideThemeCore(theme);
}

/** True when `theme` matches the upstream Office baseline (default professional template). */
export function isClassicOfficeSlideTheme(theme: SlideTheme): boolean {
  const baseline = UPSTREAM_OFFICE_SLIDE_THEME;
  return (
    theme.backgroundColor === baseline.backgroundColor &&
    theme.fontColor === baseline.fontColor &&
    theme.fontName === baseline.fontName &&
    theme.themeColors.slice(0, UPSTREAM_OFFICE_THEME_COLORS.length).join(',') ===
      UPSTREAM_OFFICE_THEME_SIGNATURE &&
    theme.outline?.color === UPSTREAM_OFFICE_OUTLINE.color &&
    theme.outline?.width === UPSTREAM_OFFICE_OUTLINE.width
  );
}
