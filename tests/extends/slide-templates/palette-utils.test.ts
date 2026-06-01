/**
 * @extends-from tests/slide-templates/palette-utils.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, it } from 'vitest';
import tinycolor from 'tinycolor2';

import {
  CLASSIC_OFFICE_THEME_COLORS,
  UPSTREAM_OFFICE_SLIDE_THEME,
  buildUpstreamFormatTheme,
  cloneUpstreamFormatTheme,
} from '@/lib/slide-templates/default-office-theme';
import { OFFICE_BLUE_SLIDE_THEME } from '@/lib/slide-templates/builtins';
import { resolveSlideThemeTypography } from '@/lib/slide-templates/theme-typography';
import {
  BUSINESS_BLACK_THEME,
  BUSINESS_GRAPHITE_THEME,
  BUSINESS_INDIGO_THEME,
  BUSINESS_MIDNIGHT_THEME,
  BUSINESS_NAVY_THEME,
} from '@/lib/slide-templates/business-builtin-themes';
import {
  buildCoordinatedGraphics,
  mixContentBlockFills,
  mixReferenceCardFills,
  mixPremiumDarkCardFills,
  REFERENCE_CARD_ACCENT_HUES,
  cardTextColorForAccent,
} from '@/lib/slide-templates/palette-utils';

describe('mixContentBlockFills', () => {
  it('mixDistinctContentBlockFills keeps hue separation on dark canvases', () => {
    const blocks = mixContentBlockFills('#0b1220', [
      '#3b82f6',
      '#60a5fa',
      '#8fa3bd',
      '#d4a853',
      '#4070c4',
    ]);
    expect(blocks).toHaveLength(5);
    const unique = new Set(blocks.map((color) => color.toLowerCase()));
    expect(unique.size).toBeGreaterThanOrEqual(4);
    blocks.forEach((color) => {
      expect(tinycolor.readability('#cbd5e1', color)).toBeGreaterThanOrEqual(4.5);
    });
  });

  it('mixPremiumDarkCardFills keeps hue separation with light body text contrast', () => {
    const blocks = mixPremiumDarkCardFills('#090909', REFERENCE_CARD_ACCENT_HUES);
    expect(blocks).toHaveLength(5);
    const unique = new Set(blocks.map((color) => color.toLowerCase()));
    expect(unique.size).toBeGreaterThanOrEqual(4);
    blocks.forEach((color) => {
      expect(tinycolor(color).isDark()).toBe(true);
      expect(tinycolor.readability('#d4d4d4', color)).toBeGreaterThanOrEqual(4.5);
    });
  });

  it('mixReferenceCardFills matches Office pastel card contrast', () => {
    const blocks = mixReferenceCardFills(REFERENCE_CARD_ACCENT_HUES);
    blocks.forEach((fill, index) => {
      const text = cardTextColorForAccent(REFERENCE_CARD_ACCENT_HUES[index]!);
      expect(tinycolor(fill).isLight()).toBe(true);
      expect(tinycolor.readability(text, fill)).toBeGreaterThanOrEqual(4.5);
    });
  });
});

describe('buildCoordinatedGraphics', () => {
  it('aligns chart colors with accent hue order', () => {
    const accents = ['#3b82f6', '#14b8a6', '#f59e0b'] as const;
    const graphics = buildCoordinatedGraphics('#0b1526', accents);
    expect(graphics.chartColors).toEqual([...accents]);
    expect(graphics.contentBlockColors).toHaveLength(3);
  });
});

describe('builtin template palettes', () => {
  const businessThemes = [
    BUSINESS_NAVY_THEME,
    BUSINESS_BLACK_THEME,
    BUSINESS_MIDNIGHT_THEME,
    BUSINESS_GRAPHITE_THEME,
    BUSINESS_INDIGO_THEME,
  ];

  it('default office theme matches upstream scene-builder baseline', () => {
    expect(OFFICE_BLUE_SLIDE_THEME).toEqual(UPSTREAM_OFFICE_SLIDE_THEME);
    expect(OFFICE_BLUE_SLIDE_THEME.themeColors).toEqual([...CLASSIC_OFFICE_THEME_COLORS]);
    expect(OFFICE_BLUE_SLIDE_THEME.outline).toEqual({ color: '#d14424', width: 2, style: 'solid' });
    expect(OFFICE_BLUE_SLIDE_THEME.contentBlockColors).toBeUndefined();
    expect(resolveSlideThemeTypography(OFFICE_BLUE_SLIDE_THEME).bodyFontColor).toBe('#333333');
  });

  it('business templates keep upstream core shape with coordinated accent systems', () => {
    for (const theme of businessThemes) {
      expect(theme.themeColors).toHaveLength(5);
      expect(theme.contentBlockColors?.length).toBe(5);
      expect(theme.titleFontColor).toBeDefined();
      expect(theme.outline?.width).toBe(2);
      expect(theme.fontName).toBe('Microsoft YaHei');
      expect(theme.themeColors.join(',')).not.toBe(CLASSIC_OFFICE_THEME_COLORS.join(','));
    }
  });

  it('each business variant has a distinct accent palette and outline', () => {
    expect(BUSINESS_NAVY_THEME.backgroundColor).toBe('#0b1220');
    expect(BUSINESS_NAVY_THEME.fontColor).toBe('#94a3b8');
    expect(BUSINESS_NAVY_THEME.outline?.color).toBe('#3b82f6');
    expect(BUSINESS_BLACK_THEME.outline?.color).toBe('#c9a962');
  });

  it('cloneUpstreamFormatTheme preserves template styling fields for apply', () => {
    const withExtras = {
      ...UPSTREAM_OFFICE_SLIDE_THEME,
      titleFontColor: '#000',
      contentBlockColors: ['#111'],
      lineColor: '#222',
    };
    const cloned = cloneUpstreamFormatTheme(withExtras);
    expect(cloned.titleFontColor).toBe('#000');
    expect(cloned.contentBlockColors).toEqual(['#111']);
    expect(cloned.lineColor).toBe('#222');
    expect(cloned.backgroundColor).toBe('#ffffff');
  });

  it('buildUpstreamFormatTheme keeps upstream outline width on dark variants', () => {
    const dark = buildUpstreamFormatTheme({
      backgroundColor: '#0f172a',
      fontColor: '#e2e8f0',
    });
    expect(dark.outline?.width).toBe(2);
    expect(dark.shadow).toEqual(UPSTREAM_OFFICE_SLIDE_THEME.shadow);
  });
});
