/**
 * @extends-from lib/slide-templates/business-builtin-themes.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import {
  buildUpstreamFormatTheme,
  type UpstreamFormatThemeOptions,
} from '@/lib/slide-templates/default-office-theme';
import { mixDistinctContentBlockFills, REFERENCE_CARD_ACCENT_HUES } from '@/lib/slide-templates/palette-utils';
import type { PPTElementShadow, SlideTheme } from '@/lib/types/slides';
import type { SlideTemplateRecord } from '@/lib/slide-templates/types';
import { SHARED_BUILTIN_LAYOUTS } from '@/lib/slide-templates/shared-layouts';

const BUILTIN_CREATED_AT = '2026-01-01T00:00:00.000Z';

const PREMIUM_DARK_SHADOW: PPTElementShadow = {
  h: 0,
  v: 10,
  blur: 32,
  color: 'rgba(0,0,0,0.32)',
};

interface BusinessDarkThemeSpec extends UpstreamFormatThemeOptions {
  readonly titleFontColor: string;
  readonly bodyFontColor?: string;
  readonly accentFontColor?: string;
  readonly mutedBlockFill: string;
  /** Per-slot accent hues for content-block fills (defaults to themeColors). */
  readonly blockAccentHues?: readonly string[];
  readonly contentBlockColors?: readonly string[];
  readonly lineColor?: string;
  readonly blockOutlineColor?: string;
  readonly shadow?: PPTElementShadow;
}

/** Builds a dark executive theme: upstream Office shape + coordinated accent system. */
function buildBusinessDarkTheme(spec: BusinessDarkThemeSpec): SlideTheme {
  const themeColors = [...(spec.themeColors ?? [])];
  const blockAccents = spec.blockAccentHues ?? [...REFERENCE_CARD_ACCENT_HUES];
  const contentBlockColors =
    spec.contentBlockColors ??
    mixDistinctContentBlockFills(spec.backgroundColor, blockAccents, {
      primaryAccent: themeColors[0],
    });

  return {
    ...buildUpstreamFormatTheme({
      backgroundColor: spec.backgroundColor,
      fontColor: spec.fontColor,
      themeColors,
      outlineColor: spec.outlineColor,
      shadow: spec.shadow ?? PREMIUM_DARK_SHADOW,
    }),
    titleFontColor: spec.titleFontColor,
    bodyFontColor: spec.bodyFontColor ?? spec.fontColor,
    accentFontColor: spec.accentFontColor ?? themeColors[1] ?? spec.fontColor,
    mutedBlockFill: spec.mutedBlockFill,
    contentBlockColors: [...contentBlockColors],
    blockAccentHues: [...blockAccents],
    lineColor: spec.lineColor ?? themeColors[0],
    blockOutlineColor: spec.blockOutlineColor ?? spec.outlineColor,
    chartColors: [...themeColors],
  };
}

export const BUSINESS_NAVY_THEME = buildBusinessDarkTheme({
  backgroundColor: '#0b1220',
  fontColor: '#94a3b8',
  titleFontColor: '#f1f5f9',
  bodyFontColor: '#cbd5e1',
  accentFontColor: '#60a5fa',
  themeColors: ['#3b82f6', '#60a5fa', '#8fa3bd', '#d4a853', '#4070c4'],
  blockAccentHues: ['#4f8ef7', '#2dd4bf', '#64748b', '#6366f1', '#d4a853'],
  outlineColor: '#3b82f6',
  mutedBlockFill: '#152238',
  shadow: { h: 0, v: 10, blur: 32, color: 'rgba(0,0,0,0.38)' },
});

export const BUSINESS_BLACK_THEME = buildBusinessDarkTheme({
  backgroundColor: '#090909',
  fontColor: '#a3a3a3',
  titleFontColor: '#fafafa',
  bodyFontColor: '#d4d4d4',
  accentFontColor: '#c9a962',
  themeColors: ['#c9a962', '#858585', '#757575', '#e5e5e5', '#a3a3a3'],
  blockAccentHues: ['#c9a962', '#a8a29e', '#7c9fd4', '#b8956b', '#8b9cb3'],
  outlineColor: '#c9a962',
  mutedBlockFill: '#141414',
  shadow: { h: 0, v: 8, blur: 28, color: 'rgba(0,0,0,0.45)' },
});

export const BUSINESS_MIDNIGHT_THEME = buildBusinessDarkTheme({
  backgroundColor: '#0a1628',
  fontColor: '#94a3b8',
  titleFontColor: '#e2e8f0',
  bodyFontColor: '#cbd5e1',
  accentFontColor: '#22d3ee',
  themeColors: ['#5b8def', '#22d3ee', '#8494ab', '#94a3b8', '#757af7'],
  blockAccentHues: ['#5b8def', '#22d3ee', '#757af7', '#64748b', '#93c5fd'],
  outlineColor: '#5b8def',
  mutedBlockFill: '#0f1d32',
  shadow: { h: 0, v: 9, blur: 30, color: 'rgba(0,0,0,0.36)' },
});

export const BUSINESS_GRAPHITE_THEME = buildBusinessDarkTheme({
  backgroundColor: '#18181b',
  fontColor: '#a1a1aa',
  titleFontColor: '#f4f4f5',
  bodyFontColor: '#d4d4d8',
  accentFontColor: '#3b82f6',
  themeColors: ['#8b8b94', '#a1a1aa', '#d4d4d8', '#3b82f6', '#94949c'],
  blockAccentHues: ['#5b8def', '#64748b', '#818cf8', '#475569', '#38bdf8'],
  outlineColor: '#8b8b94',
  mutedBlockFill: '#27272a',
  shadow: { h: 0, v: 8, blur: 26, color: 'rgba(0,0,0,0.34)' },
});

export const BUSINESS_INDIGO_THEME = buildBusinessDarkTheme({
  backgroundColor: '#13132b',
  fontColor: '#a5b4fc',
  titleFontColor: '#eef2ff',
  bodyFontColor: '#c7d2fe',
  accentFontColor: '#818cf8',
  themeColors: ['#818cf8', '#a78bfa', '#888ef9', '#38bdf8', '#757af7'],
  blockAccentHues: ['#818cf8', '#a78bfa', '#38bdf8', '#6366f1', '#c4b5fd'],
  outlineColor: '#818cf8',
  mutedBlockFill: '#1c1b3a',
  shadow: { h: 0, v: 10, blur: 34, color: 'rgba(0,0,0,0.4)' },
});

function makeBusinessBuiltin(
  id: string,
  name: string,
  description: string,
  theme: SlideTheme,
): SlideTemplateRecord {
  return {
    id,
    name,
    description,
    scope: 'builtin',
    theme,
    layouts: SHARED_BUILTIN_LAYOUTS,
    createdAt: BUILTIN_CREATED_AT,
    updatedAt: BUILTIN_CREATED_AT,
  };
}

/** Five dark executive variants — upstream theme shape, per-template accent systems. */
export const BUSINESS_BUILTIN_SLIDE_TEMPLATES: SlideTemplateRecord[] = [
  makeBusinessBuiltin(
    'builtin:theme-business-navy',
    '深蓝商务',
    '董事会级深藏青，钴蓝主色与香槟金点缀，克制商务气质。',
    BUSINESS_NAVY_THEME,
  ),
  makeBusinessBuiltin(
    'builtin:theme-business-black',
    '曜石黑',
    '近黑底配香槟金描边，极简奢华 keynote 风格。',
    BUSINESS_BLACK_THEME,
  ),
  makeBusinessBuiltin(
    'builtin:theme-business-midnight',
    '午夜钢蓝',
    '钢蓝科技 keynote，青蓝高光与靛紫锚点。',
    BUSINESS_MIDNIGHT_THEME,
  ),
  makeBusinessBuiltin(
    'builtin:theme-business-graphite',
    '石墨灰',
    '锌灰工业质感，冷蓝单点强调，沉稳高级。',
    BUSINESS_GRAPHITE_THEME,
  ),
  makeBusinessBuiltin(
    'builtin:theme-business-indigo',
    '靛蓝商务',
    '靛紫权威感，创意企业与战略汇报适用。',
    BUSINESS_INDIGO_THEME,
  ),
];
