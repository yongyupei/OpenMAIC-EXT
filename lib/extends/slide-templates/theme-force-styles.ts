/**
 * @extends-from lib/slide-templates/theme-force-styles.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { isClassicOfficeSlideTheme } from '@/lib/slide-templates/default-office-theme';
import type { PPTElementOutline, PPTElementShadow, SlideTheme, TextType } from '@/lib/types/slides';
import type { ResolvedSlideThemeGraphics } from '@/lib/slide-templates/theme-graphics';
import type { ResolvedSlideThemeTypography } from '@/lib/slide-templates/theme-typography';

export interface ForceTextStyle {
  readonly color: string;
  readonly fontName: string;
  readonly fontSizePx: number;
  readonly bold?: boolean;
}

const TITLE_TEXT_TYPES = new Set<TextType>(['title', 'subtitle', 'itemTitle', 'header']);
const ACCENT_TEXT_TYPES = new Set<TextType>(['notes', 'footer', 'partNumber', 'itemNumber']);

const FONT_SIZE_BY_TEXT_TYPE: Partial<Record<TextType, number>> = {
  title: 28,
  subtitle: 22,
  header: 20,
  itemTitle: 20,
  content: 18,
  item: 18,
  notes: 14,
  footer: 14,
  partNumber: 14,
  itemNumber: 14,
};

const BOLD_TEXT_TYPES = new Set<TextType>(['title', 'header', 'itemTitle']);

function remapHtmlFontFamily(html: string, fontName: string): string {
  if (!html || !fontName) return html;

  return html
    .replace(/font-family:\s*[^;"']+/gi, `font-family: ${fontName}`)
    .replace(/font-family:\s*['"][^'"]+['"]/gi, `font-family: '${fontName}'`);
}

export function resolveForceTextStyle(
  textType: TextType | undefined,
  typography: ResolvedSlideThemeTypography,
): ForceTextStyle {
  const resolvedType: TextType = textType ?? 'content';
  const fontSizePx = FONT_SIZE_BY_TEXT_TYPE[resolvedType] ?? 18;
  let color = typography.bodyFontColor;
  let fontName = typography.bodyFontName;

  if (TITLE_TEXT_TYPES.has(resolvedType)) {
    color = typography.titleFontColor;
    fontName = typography.titleFontName;
  } else if (ACCENT_TEXT_TYPES.has(resolvedType)) {
    color = typography.accentFontColor;
  }

  return {
    color,
    fontName,
    fontSizePx,
    bold: BOLD_TEXT_TYPES.has(resolvedType),
  };
}

/** Overwrites inline HTML color, font, size, and strips background styles. */
export function forceHtmlTextStyles(html: string, style: ForceTextStyle): string {
  if (!html) {
    return `<p style="font-size: ${style.fontSizePx}px; color: ${style.color}; font-family: ${style.fontName};">${''}</p>`;
  }

  let result = html
    .replace(/\s*background-color:\s*[^;"}]+;?/gi, '')
    .replace(/\s*background:\s*[^;"}]+;?/gi, '')
    .replace(/font-size:\s*[^;]+/gi, `font-size: ${style.fontSizePx}px`)
    .replace(/color:\s*#(?:[0-9a-fA-F]{3,8})/gi, `color: ${style.color}`)
    .replace(/color:\s*rgba?\([^)]+\)/gi, `color: ${style.color}`)
    .replace(/font-weight:\s*[^;]+;?/gi, style.bold ? 'font-weight: bold;' : '');

  if (!/font-size\s*:/i.test(result)) {
    result = result.replace(/<p(\s[^>]*)?>/i, (match, attrs) => {
      if (attrs?.includes('style=')) {
        return match.replace(
          /style=(['"])([^'"]*)\1/i,
          `style="$2; font-size: ${style.fontSizePx}px; color: ${style.color}; font-family: ${style.fontName};"`,
        );
      }
      return `<p style="font-size: ${style.fontSizePx}px; color: ${style.color}; font-family: ${style.fontName};">`;
    });
  }

  result = remapHtmlFontFamily(result, style.fontName);

  if (style.bold && !/<strong\b/i.test(result)) {
    result = result.replace(/(<p[^>]*>)([\s\S]*?)(<\/p>)/i, '$1<strong>$2</strong>$3');
  }

  return result;
}

export function resolveForceElementOutline(
  theme: SlideTheme,
  graphics: ResolvedSlideThemeGraphics,
): PPTElementOutline {
  return {
    style: theme.outline?.style ?? 'solid',
    width: theme.outline?.width ?? 1,
    color: graphics.blockOutlineColor,
  };
}

export function resolveForceElementShadow(theme: SlideTheme): PPTElementShadow | undefined {
  if (isClassicOfficeSlideTheme(theme) || !theme.shadow) return undefined;
  return { ...theme.shadow };
}
