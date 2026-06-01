/**
 * @extends-from tests/slide-templates/business-builtin-themes.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, it } from 'vitest';
import tinycolor from 'tinycolor2';

import { getBuiltinSlideTemplate, listBuiltinSlideTemplates } from '@/lib/slide-templates/builtins';
import {
  BUSINESS_BLACK_THEME,
  BUSINESS_BUILTIN_SLIDE_TEMPLATES,
  BUSINESS_GRAPHITE_THEME,
  BUSINESS_INDIGO_THEME,
  BUSINESS_MIDNIGHT_THEME,
  BUSINESS_NAVY_THEME,
} from '@/lib/slide-templates/business-builtin-themes';
import { UPSTREAM_OFFICE_SLIDE_THEME } from '@/lib/slide-templates/default-office-theme';
import { BUILTIN_DEFAULT_TEMPLATE_ID } from '@/lib/slide-templates/constants';
import type { SlideTheme } from '@/lib/types/slides';

function assertBusinessThemeWcag(theme: SlideTheme): void {
  const bg = theme.backgroundColor;
  const textColors = [theme.titleFontColor!, theme.bodyFontColor!, theme.fontColor];
  for (const color of textColors) {
    expect(tinycolor.readability(color, bg)).toBeGreaterThanOrEqual(4.5);
  }
  for (const color of theme.themeColors) {
    expect(tinycolor.readability(color, bg)).toBeGreaterThanOrEqual(3);
  }
  if (theme.outline?.color) {
    expect(tinycolor.readability(theme.outline.color, bg)).toBeGreaterThanOrEqual(3);
  }
  for (const color of theme.contentBlockColors ?? []) {
    expect(tinycolor.readability(theme.bodyFontColor!, color)).toBeGreaterThanOrEqual(4.5);
    expect(tinycolor(color).isDark()).toBe(true);
  }
  const uniqueBlocks = new Set((theme.contentBlockColors ?? []).map((c) => c.toLowerCase()));
  expect(uniqueBlocks.size).toBeGreaterThanOrEqual(4);
}

describe('business builtin slide templates', () => {
  it('builtin catalog is default plus five business templates only', () => {
    expect(BUSINESS_BUILTIN_SLIDE_TEMPLATES).toHaveLength(5);
    expect(listBuiltinSlideTemplates()).toHaveLength(6);
    expect(getBuiltinSlideTemplate(BUILTIN_DEFAULT_TEMPLATE_ID)?.name).toBe(
      'Default professional',
    );
    expect(getBuiltinSlideTemplate('builtin:theme-dark-teal')).toBeUndefined();
  });

  it('keeps upstream core theme shape with per-template accent systems', () => {
    for (const template of BUSINESS_BUILTIN_SLIDE_TEMPLATES) {
      const { theme } = template;
      expect(theme.themeColors).toHaveLength(5);
      expect(theme.outline?.width).toBe(2);
      expect(theme.fontName).toBe('Microsoft YaHei');
      expect(theme.titleFontColor).toBeDefined();
      expect(theme.contentBlockColors?.length).toBe(5);
      expect(theme.mutedBlockFill).toBeDefined();
      expect(theme.outline?.color).not.toBe(UPSTREAM_OFFICE_SLIDE_THEME.outline?.color);
      expect(theme.themeColors.join(',')).not.toBe(UPSTREAM_OFFICE_SLIDE_THEME.themeColors.join(','));
    }
  });

  it('uses dark backgrounds, light titles, and readable body text', () => {
    for (const template of BUSINESS_BUILTIN_SLIDE_TEMPLATES) {
      expect(tinycolor(template.theme.backgroundColor).isDark()).toBe(true);
      expect(tinycolor(template.theme.titleFontColor!).isLight()).toBe(true);
      expect(tinycolor(template.theme.fontColor).getLuminance()).toBeGreaterThan(0.15);
    }
    expect(BUSINESS_BLACK_THEME.backgroundColor).toBe('#090909');
    expect(BUSINESS_NAVY_THEME.outline?.color).toBe('#3b82f6');
    expect(BUSINESS_MIDNIGHT_THEME.outline?.color).toBe('#5b8def');
    expect(BUSINESS_GRAPHITE_THEME.outline?.color).toBe('#8b8b94');
    expect(BUSINESS_INDIGO_THEME.outline?.color).toBe('#818cf8');
  });

  it('registers all business template ids in the builtin catalog', () => {
    const ids = new Set(listBuiltinSlideTemplates().map((t) => t.id));
    for (const template of BUSINESS_BUILTIN_SLIDE_TEMPLATES) {
      expect(ids.has(template.id)).toBe(true);
    }
  });

  it.each([
    ['navy', BUSINESS_NAVY_THEME],
    ['black', BUSINESS_BLACK_THEME],
    ['midnight', BUSINESS_MIDNIGHT_THEME],
    ['graphite', BUSINESS_GRAPHITE_THEME],
    ['indigo', BUSINESS_INDIGO_THEME],
  ])('%s template meets WCAG AA contrast on canvas background', (_name, theme) => {
    assertBusinessThemeWcag(theme);
  });
});
