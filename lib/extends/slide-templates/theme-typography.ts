/**
 * @extends-from lib/slide-templates/theme-typography.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import type { PPTElement, PPTShapeElement, PPTTextElement, Slide, SlideTheme, TextType } from '@/lib/types/slides';
import tinycolor from 'tinycolor2';
import { isClassicOfficeSlideTheme } from '@/lib/slide-templates/default-office-theme';
import {
  softAccentForPanelHeading,
  softBodyColorForPanel,
} from '@/lib/slide-templates/palette-utils';
import {
  buildPanelSlotAssignments,
  isContentPanelShape,
} from '@/lib/slide-templates/theme-graphics';
import {
  forceHtmlTextStyles,
  resolveForceTextStyle,
} from '@/lib/slide-templates/theme-force-styles';
import {
  buildThemeColorRemap,
  remapColor,
  remapHtmlThemeColors,
} from '@/lib/slide-templates/theme-color-remap';

export interface ResolvedSlideThemeTypography {
  readonly fontName: string;
  readonly titleFontName: string;
  readonly bodyFontName: string;
  readonly bodyFontColor: string;
  readonly titleFontColor: string;
  readonly accentFontColor: string;
}

const TITLE_TEXT_TYPES = new Set<TextType>(['title', 'subtitle', 'itemTitle', 'header']);
const ACCENT_TEXT_TYPES = new Set<TextType>(['notes', 'footer', 'partNumber', 'itemNumber']);

/** Resolves optional template typography fields with sensible defaults. */
export function resolveSlideThemeTypography(theme: SlideTheme): ResolvedSlideThemeTypography {
  const primary = theme.themeColors[0] ?? theme.fontColor;
  const secondary = theme.themeColors[1] ?? primary;
  const isDarkBackground = tinycolor(theme.backgroundColor).isDark();

  const bodyFontColor =
    theme.bodyFontColor ??
    (isDarkBackground ? tinycolor(theme.fontColor).desaturate(5).toHexString() : theme.fontColor);
  const titleFontColor =
    theme.titleFontColor ??
    (isDarkBackground ? tinycolor(theme.themeColors[0] ?? theme.fontColor).brighten(12).toHexString() : primary);

  return {
    fontName: theme.fontName,
    titleFontName: theme.titleFontName ?? theme.fontName,
    bodyFontName: theme.bodyFontName ?? theme.fontName,
    bodyFontColor,
    titleFontColor,
    accentFontColor: theme.accentFontColor ?? secondary,
  };
}

export function resolveTextColorForTextType(
  textType: TextType | undefined,
  typography: ResolvedSlideThemeTypography,
): string {
  if (textType && TITLE_TEXT_TYPES.has(textType)) return typography.titleFontColor;
  if (textType && ACCENT_TEXT_TYPES.has(textType)) return typography.accentFontColor;
  return typography.bodyFontColor;
}

export function resolveFontNameForTextType(
  textType: TextType | undefined,
  typography: ResolvedSlideThemeTypography,
): string {
  if (textType && TITLE_TEXT_TYPES.has(textType)) return typography.titleFontName;
  return typography.bodyFontName;
}

/** Applies template font family to inline HTML styles. */
export function remapHtmlFontFamily(html: string, fontName: string): string {
  if (!html || !fontName) return html;

  return html
    .replace(/font-family:\s*[^;"']+/gi, `font-family: ${fontName}`)
    .replace(/font-family:\s*['"][^'"]+['"]/gi, `font-family: '${fontName}'`);
}

/** Forces inline text color and font without reading or remapping existing colors. */
export function forceHtmlTextTypography(html: string, color: string, fontName: string): string {
  if (!html) return html;
  const result = html
    .replace(/color:\s*#(?:[0-9a-fA-F]{3,8})/gi, `color: ${color}`)
    .replace(/color:\s*rgba?\([^)]+\)/gi, `color: ${color}`);
  return remapHtmlFontFamily(result, fontName);
}

/** Forces inline text color and font on HTML after palette remapping. */
export function applyHtmlTextTypography(
  html: string,
  colorMap: Map<string, string>,
  color: string,
  fontName: string,
): string {
  let result = remapHtmlThemeColors(html, colorMap);
  result = result.replace(/color:\s*#(?:[0-9a-fA-F]{3,8})/gi, `color: ${color}`);
  result = result.replace(/color:\s*rgba?\([^)]+\)/gi, `color: ${color}`);
  return remapHtmlFontFamily(result, fontName);
}

export function remapHtmlTypography(
  html: string,
  colorMap: Map<string, string>,
  fontName: string,
): string {
  return remapHtmlFontFamily(remapHtmlThemeColors(html, colorMap), fontName);
}

/** Infers title vs body when AI did not set textType (font-size / layout heuristics). */
export function inferTextType(element: PPTTextElement): TextType | undefined {
  if (element.textType) return element.textType;

  const sizeMatch = element.content.match(/font-size:\s*(\d+(?:\.\d+)?)\s*px/i);
  if (sizeMatch) {
    const px = Number(sizeMatch[1]);
    if (px >= 26) return 'title';
    if (px >= 20) return 'subtitle';
  }

  if (element.top < 140 && element.height >= 56) return 'title';
  if (element.top < 200 && element.height >= 44) return 'subtitle';

  return undefined;
}

function panelOverlapsText(panel: PPTShapeElement, text: PPTTextElement): boolean {
  const pad = 6;
  return !(
    text.left + text.width < panel.left - pad ||
    panel.left + panel.width < text.left - pad ||
    text.top + text.height < panel.top - pad ||
    panel.top + panel.height < text.top - pad
  );
}

function findPanelSlotForText(
  element: PPTTextElement,
  panels: readonly PPTShapeElement[],
  panelSlots: Map<string, number>,
): number | undefined {
  for (const panel of panels) {
    if (panelOverlapsText(panel, element)) {
      return panelSlots.get(panel.id);
    }
  }
  return undefined;
}

function isCardHeading(textType: TextType | undefined, content: string): boolean {
  if (textType === 'itemTitle' || textType === 'header') return true;
  const sizeMatch = content.match(/font-size:\s*(\d+(?:\.\d+)?)\s*px/i);
  if (sizeMatch && Number(sizeMatch[1]) >= 20) return true;
  return /<strong>/i.test(content);
}

function resolvePanelAccent(theme: SlideTheme, slot: number): string {
  const accents = theme.blockAccentHues ?? theme.themeColors;
  return accents[slot % accents.length]!;
}

function applyPanelTextTypography(
  content: string,
  textType: TextType | undefined,
  colorMap: Map<string, string>,
  typography: ResolvedSlideThemeTypography,
  theme: SlideTheme,
  panelSlot: number,
  panelFill?: string,
): { defaultColor: string; defaultFontName: string; content: string } {
  const heading = isCardHeading(textType, content);
  const accent = resolvePanelAccent(theme, panelSlot);
  const fill = panelFill ?? theme.contentBlockColors?.[panelSlot % (theme.contentBlockColors.length || 1)] ?? theme.backgroundColor;
  const color = heading
    ? softAccentForPanelHeading(accent, fill)
    : softBodyColorForPanel(typography.bodyFontColor);
  const fontName = heading ? typography.titleFontName : typography.bodyFontName;
  const fontSizePx = heading ? 20 : 17;
  let html = applyHtmlTextTypography(content, colorMap, color, fontName);
  html = forceHtmlTextStyles(html, {
    color,
    fontName,
    fontSizePx,
    bold: heading,
  });
  return { defaultColor: color, defaultFontName: fontName, content: html };
}

function isSlideCanvasText(
  element: PPTTextElement,
  panelSlot: number | undefined,
  textType: TextType | undefined,
): boolean {
  if (panelSlot !== undefined) return false;
  if (textType && TITLE_TEXT_TYPES.has(textType)) return true;
  return element.top < 130 && element.height >= 40;
}

function resolvePanelSlotFromShape(
  shape: PPTShapeElement,
  panelSlots: Map<string, number>,
): number | undefined {
  return panelSlots.get(shape.id);
}

function applyTypographyToTextLike(
  content: string,
  textType: TextType | undefined,
  colorMap: Map<string, string>,
  typography: ResolvedSlideThemeTypography,
): { defaultColor: string; defaultFontName: string; content: string } {
  const fontName = resolveFontNameForTextType(textType, typography);
  const color = resolveTextColorForTextType(textType, typography);

  return {
    defaultFontName: fontName,
    defaultColor: color,
    content: applyHtmlTextTypography(content, colorMap, color, fontName),
  };
}

function applyTypographyToTextLikeForce(
  content: string,
  textType: TextType | undefined,
  typography: ResolvedSlideThemeTypography,
): { defaultColor: string; defaultFontName: string; content: string } {
  const style = resolveForceTextStyle(textType, typography);

  return {
    defaultFontName: style.fontName,
    defaultColor: style.color,
    content: forceHtmlTextStyles(content, style),
  };
}

/** Forces template typography onto elements (no palette remapping). */
export function forceApplyThemeTypographyToElement(
  element: PPTElement,
  typography: ResolvedSlideThemeTypography,
): PPTElement {
  const el = structuredClone(element);

  switch (el.type) {
    case 'text': {
      const applied = applyTypographyToTextLikeForce(el.content, inferTextType(el), typography);
      el.defaultColor = applied.defaultColor;
      el.defaultFontName = applied.defaultFontName;
      el.content = applied.content;
      break;
    }
    case 'shape': {
      if (el.text) {
        const applied = applyTypographyToTextLikeForce(el.text.content, el.text.type, typography);
        el.text = {
          ...el.text,
          defaultColor: applied.defaultColor,
          defaultFontName: applied.defaultFontName,
          content: applied.content,
        };
      }
      break;
    }
    case 'table': {
      el.data = el.data.map((row) =>
        row.map((cell) => ({
          ...cell,
          style: {
            ...cell.style,
            color: typography.bodyFontColor,
            fontname: typography.bodyFontName,
          },
        })),
      );
      break;
    }
    case 'chart':
      el.textColor = typography.bodyFontColor;
      break;
    default:
      break;
  }

  return el;
}

export function forceApplyThemeTypographyToCanvas(slide: Slide, newTheme: SlideTheme): Slide {
  const typography = resolveSlideThemeTypography(newTheme);

  return {
    ...slide,
    theme: { ...newTheme },
    background: { type: 'solid', color: newTheme.backgroundColor },
    elements: slide.elements.map((element) =>
      forceApplyThemeTypographyToElement(element, typography),
    ),
  };
}

/** Applies typography with Office-style dark text on pastel card panels over dark canvases. */
export function applyCardAwareTypographyToCanvas(slide: Slide, newTheme: SlideTheme): Slide {
  const isDarkBusiness =
    tinycolor(newTheme.backgroundColor).isDark() && !isClassicOfficeSlideTheme(newTheme);
  if (!isDarkBusiness) {
    return applyThemeTypographyToCanvas(slide, newTheme);
  }

  const colorMap = buildThemeColorRemap(slide.theme, newTheme);
  const typography = resolveSlideThemeTypography(newTheme);
  const shapes = slide.elements.filter((element) => element.type === 'shape') as PPTShapeElement[];
  const panels = shapes.filter(isContentPanelShape);
  const panelSlots = buildPanelSlotAssignments(shapes);

  const elements = slide.elements.map((element) => {
    if (element.type === 'text') {
      const textType = inferTextType(element);
      const panelSlot = findPanelSlotForText(element, panels, panelSlots);
      if (panelSlot !== undefined) {
        const applied = applyPanelTextTypography(
          element.content,
          textType,
          colorMap,
          typography,
          newTheme,
          panelSlot,
        );
        return {
          ...element,
          defaultColor: applied.defaultColor,
          defaultFontName: applied.defaultFontName,
          content: applied.content,
        };
      }
      if (isSlideCanvasText(element, panelSlot, textType)) {
        return applyThemeTypographyToElement(element, colorMap, typography);
      }
      return applyThemeTypographyToElement(element, colorMap, typography);
    }

    if (element.type === 'shape' && element.text) {
      const textType = element.text.type ?? 'content';
      const panelSlot = resolvePanelSlotFromShape(element, panelSlots);
      if (panelSlot !== undefined) {
        const applied = applyPanelTextTypography(
          element.text.content,
          textType,
          colorMap,
          typography,
          newTheme,
          panelSlot,
        );
        return {
          ...element,
          text: {
            ...element.text,
            defaultColor: applied.defaultColor,
            defaultFontName: applied.defaultFontName,
            content: applied.content,
          },
        };
      }
    }

    return applyThemeTypographyToElement(element, colorMap, typography);
  });

  return {
    ...slide,
    theme: { ...newTheme },
    elements,
    background: { type: 'solid', color: newTheme.backgroundColor },
  };
}

/** Applies template typography to a single element (text colors, fonts, inline HTML). */
export function applyThemeTypographyToElement(
  element: PPTElement,
  colorMap: Map<string, string>,
  typography: ResolvedSlideThemeTypography,
): PPTElement {
  const el = structuredClone(element);

  switch (el.type) {
    case 'text': {
      const applied = applyTypographyToTextLike(
        el.content,
        inferTextType(el),
        colorMap,
        typography,
      );
      el.defaultColor = applied.defaultColor;
      el.defaultFontName = applied.defaultFontName;
      el.content = applied.content;
      break;
    }
    case 'shape': {
      if (el.text) {
        const applied = applyTypographyToTextLike(el.text.content, el.text.type, colorMap, typography);
        el.text = {
          ...el.text,
          defaultColor: applied.defaultColor,
          defaultFontName: applied.defaultFontName,
          content: applied.content,
        };
      }
      break;
    }
    case 'table': {
      el.data = el.data.map((row) =>
        row.map((cell) => ({
          ...cell,
          style: {
            ...cell.style,
            color: typography.bodyFontColor,
            fontname: typography.bodyFontName,
          },
        })),
      );
      break;
    }
    case 'chart': {
      el.textColor = typography.bodyFontColor;
      break;
    }
    default:
      break;
  }

  return el;
}

/** Applies template typography to all slide elements. */
export function applyThemeTypographyToElements(
  elements: readonly PPTElement[],
  newTheme: SlideTheme,
  oldTheme?: SlideTheme,
): PPTElement[] {
  const typography = resolveSlideThemeTypography(newTheme);
  const colorMap = oldTheme ? buildThemeColorRemap(oldTheme, newTheme) : new Map<string, string>();

  return elements.map((element) => applyThemeTypographyToElement(element, colorMap, typography));
}

/** Applies template theme typography to a slide canvas (text + background + theme object). */
export function applyThemeTypographyToCanvas(slide: Slide, newTheme: SlideTheme): Slide {
  const colorMap = buildThemeColorRemap(slide.theme, newTheme);
  const typography = resolveSlideThemeTypography(newTheme);

  const elements = slide.elements.map((element) =>
    applyThemeTypographyToElement(element, colorMap, typography),
  );

  let background = slide.background;
  if (background?.type === 'solid' && background.color) {
    background = {
      type: 'solid',
      color: remapColor(background.color, colorMap),
    };
  } else {
    background = { type: 'solid', color: newTheme.backgroundColor };
  }

  return {
    ...slide,
    theme: { ...newTheme },
    elements,
    background,
  };
}
