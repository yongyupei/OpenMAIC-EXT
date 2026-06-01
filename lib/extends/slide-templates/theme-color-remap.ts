/**
 * @extends-from lib/slide-templates/theme-color-remap.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import tinycolor from 'tinycolor2';

import type {
  Gradient,
  PPTElement,
  PPTElementOutline,
  PPTElementShadow,
  SlideTheme,
} from '@/lib/types/slides';

function themePalette(theme: SlideTheme): string[] {
  const colors = [
    theme.backgroundColor,
    theme.fontColor,
    theme.bodyFontColor,
    theme.titleFontColor,
    theme.accentFontColor,
    ...theme.themeColors,
    ...(theme.outline?.color ? [theme.outline.color] : []),
    ...(theme.shadow?.color ? [theme.shadow.color] : []),
  ];
  return colors.filter((color): color is string => Boolean(color));
}

export function normalizeColorKey(color: string): string | null {
  const parsed = tinycolor(color);
  return parsed.isValid() ? parsed.toHexString().toLowerCase() : null;
}

/** Maps normalized old theme colors to new theme color strings. */
export function buildThemeColorRemap(
  oldTheme: SlideTheme,
  newTheme: SlideTheme,
): Map<string, string> {
  const from = themePalette(oldTheme);
  const to = themePalette(newTheme);
  const fallback = newTheme.themeColors[0] ?? newTheme.fontColor;
  const map = new Map<string, string>();

  from.forEach((oldColor, index) => {
    const key = normalizeColorKey(oldColor);
    if (!key || map.has(key)) return;
    map.set(key, to[index] ?? to[to.length - 1] ?? fallback);
  });

  return map;
}

export function remapColor(color: string, map: Map<string, string>): string {
  const key = normalizeColorKey(color);
  if (!key) return color;
  return map.get(key) ?? color;
}

function remapOutline(
  outline: PPTElementOutline | undefined,
  map: Map<string, string>,
): PPTElementOutline | undefined {
  if (!outline?.color) return outline;
  return { ...outline, color: remapColor(outline.color, map) };
}

function remapShadow(
  shadow: PPTElementShadow | undefined,
  map: Map<string, string>,
): PPTElementShadow | undefined {
  if (!shadow?.color) return shadow;
  return { ...shadow, color: remapColor(shadow.color, map) };
}

function remapGradient(gradient: Gradient | undefined, map: Map<string, string>): Gradient | undefined {
  if (!gradient) return gradient;
  return {
    ...gradient,
    colors: gradient.colors.map((stop) => ({
      ...stop,
      color: remapColor(stop.color, map),
    })),
  };
}

/** Replaces inline hex and rgb/rgba colors in HTML when they match the theme palette map. */
export function remapHtmlThemeColors(html: string, map: Map<string, string>): string {
  if (!html || map.size === 0) return html;

  let result = html.replace(
    /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g,
    (match) => remapColor(match, map),
  );

  result = result.replace(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*[\d.]+)?\s*\)/gi,
    (match) => {
      const parsed = tinycolor(match);
      if (!parsed.isValid()) return match;
      const key = parsed.toHexString().toLowerCase();
      return map.get(key) ?? match;
    },
  );

  return result;
}

/** Remaps shape, line, chart, and other non-text element colors. */
export function remapElementVisualColors(element: PPTElement, map: Map<string, string>): PPTElement {
  const el = structuredClone(element);

  switch (el.type) {
    case 'text':
      if (el.fill) el.fill = remapColor(el.fill, map);
      el.outline = remapOutline(el.outline, map);
      el.shadow = remapShadow(el.shadow, map);
      break;
    case 'shape': {
      el.fill = remapColor(el.fill, map);
      el.gradient = remapGradient(el.gradient, map);
      el.outline = remapOutline(el.outline, map);
      el.shadow = remapShadow(el.shadow, map);
      break;
    }
    case 'line':
      el.color = remapColor(el.color, map);
      break;
    case 'chart':
      el.themeColors = el.themeColors.map((color) => remapColor(color, map));
      if (el.fill) el.fill = remapColor(el.fill, map);
      if (el.lineColor) el.lineColor = remapColor(el.lineColor, map);
      el.outline = remapOutline(el.outline, map);
      break;
    case 'table':
      el.outline = remapOutline(el.outline, map) ?? el.outline;
      if (el.theme?.color) {
        el.theme = { ...el.theme, color: remapColor(el.theme.color, map) };
      }
      el.data = el.data.map((row) =>
        row.map((cell) => {
          if (!cell.style) return cell;
          const style = { ...cell.style };
          if (style.color) style.color = remapColor(style.color, map);
          if (style.backcolor) style.backcolor = remapColor(style.backcolor, map);
          return { ...cell, style };
        }),
      );
      break;
    case 'latex':
      if (el.color) el.color = remapColor(el.color, map);
      break;
    default:
      break;
  }

  return el;
}
