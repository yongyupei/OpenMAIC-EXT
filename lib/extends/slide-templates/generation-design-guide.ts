/**
 * Prompt-facing design guides for non-default slide templates (Phase 2 prompt-first pipeline).
 */
import tinycolor from 'tinycolor2';

import { resolveSlideThemeTypography } from '@/lib/slide-templates/theme-typography';
import type { SlideTemplateRecord } from '@/lib/slide-templates/types';
import type { SlideTheme } from '@/lib/types/slides';

/** True when canvas background is dark (generation must use light text). */
export function isDarkSlideBackground(backgroundColor: string): boolean {
  return tinycolor(backgroundColor).isValid() && tinycolor(backgroundColor).getLuminance() < 0.12;
}

/** Compact dark-template color guide — structure is added by slide-visual-enricher post-process. */
export function formatTemplateDesignGuideForPrompt(record: SlideTemplateRecord): string {
  const { theme, name } = record;
  const dark = isDarkSlideBackground(theme.backgroundColor);
  if (!dark) {
    return '';
  }

  const typography = resolveSlideThemeTypography(theme);

  return [
    `## Template: ${name} (dark canvas)`,
    `- JSON background color: \`${theme.backgroundColor}\``,
    `- Title text \`defaultColor\`: ${typography.titleFontColor}`,
    `- Body text \`defaultColor\`: ${typography.bodyFontColor} — never #333333 on dark canvas`,
    `- Chart/shape accents (optional): ${theme.themeColors.join(', ')}`,
    `- Use theme font colors on text; include shape blocks using theme accent fills.`,
  ].join('\n');
}

export interface TemplatePromptVariables {
  readonly templateDesignGuide?: string;
  readonly isDarkTemplate?: boolean;
  readonly slideBackgroundColor?: string;
  readonly titleBarFill?: string;
  readonly titleFontColor?: string;
  readonly bodyFontColor?: string;
  readonly accentFontColor?: string;
  readonly contentBlockColors?: string;
  readonly themeColors?: string;
  readonly fontColor?: string;
  readonly fontName?: string;
}

/** Variables injected into slide-content prompts when a non-default template is active. */
export function buildTemplatePromptVariables(
  record: SlideTemplateRecord,
): TemplatePromptVariables {
  const { theme } = record;
  const typography = resolveSlideThemeTypography(theme);
  const dark = isDarkSlideBackground(theme.backgroundColor);
  const guide = formatTemplateDesignGuideForPrompt(record);

  if (!dark) {
    return guide ? { templateDesignGuide: guide, isDarkTemplate: false } : { isDarkTemplate: false };
  }

  return {
    templateDesignGuide: guide,
    isDarkTemplate: true,
    slideBackgroundColor: theme.backgroundColor,
    titleBarFill: theme.themeColors[0] ?? theme.backgroundColor,
    titleFontColor: typography.titleFontColor,
    bodyFontColor: typography.bodyFontColor,
    accentFontColor: typography.accentFontColor,
    contentBlockColors: theme.themeColors.join(', '),
    themeColors: theme.themeColors.join(', '),
    fontColor: theme.fontColor,
    fontName: theme.fontName,
  };
}

export function isDarkSlideTheme(theme: SlideTheme): boolean {
  return isDarkSlideBackground(theme.backgroundColor);
}

/** Default professional template — no extra prompt injection (upstream Office parity). */
export function buildDefaultTemplatePromptVariables(): TemplatePromptVariables {
  return {};
}

/** @deprecated Visual structure is enforced by slide-visual-enricher; kept for tests/tooling. */
export function buildPremiumVisualGuide(_theme: SlideTheme, _templateName?: string): string {
  return '';
}
