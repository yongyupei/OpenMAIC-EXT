/**
 * @extends-from lib/slide-templates/theme-graphics.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import tinycolor from 'tinycolor2';

import type {
  Gradient,
  PPTElement,
  PPTElementOutline,
  PPTShapeElement,
  Slide,
  SlideTheme,
} from '@/lib/types/slides';
import { isClassicOfficeSlideTheme } from '@/lib/slide-templates/default-office-theme';
import {
  accentFromContentBlockFill,
  buildPremiumPanelGradient,
  harmonizePanelBorderColor,
  mixDistinctContentBlockFills,
  softenAccentForRail,
} from '@/lib/slide-templates/palette-utils';
import { normalizeColorKey, remapColor } from '@/lib/slide-templates/theme-color-remap';

const ACCENT_STRIP_MAX_THIN = 24;
const CANVAS_WIDTH = 1000;

/** Thin vertical/horizontal accent bar beside a content card. */
export function isAccentStripShape(shape: PPTShapeElement): boolean {
  const minDim = Math.min(shape.width, shape.height);
  const maxDim = Math.max(shape.width, shape.height);
  return minDim <= ACCENT_STRIP_MAX_THIN && maxDim >= 40 && maxDim / Math.max(minDim, 1) >= 2.5;
}

/** Full-width title band — not a content card. */
export function isTitleBandShape(shape: PPTShapeElement): boolean {
  return shape.width >= CANVAS_WIDTH * 0.85 && shape.top <= 150 && shape.height <= 160;
}

/** Left canvas rail from template chrome. */
export function isCanvasRailShape(shape: PPTShapeElement): boolean {
  return shape.left <= 8 && shape.width <= 10 && shape.height >= 400;
}

/** Large card / panel shape that should receive a distinct content-block fill. */
export function isContentPanelShape(shape: PPTShapeElement): boolean {
  if (isAccentStripShape(shape) || isTitleBandShape(shape) || isCanvasRailShape(shape)) {
    return false;
  }
  const area = shape.width * shape.height;
  return shape.width >= 80 && shape.height >= 50 && area >= 6000;
}

function shapeCenter(shape: PPTShapeElement): { readonly x: number; readonly y: number } {
  return { x: shape.left + shape.width / 2, y: shape.top + shape.height / 2 };
}

function findNearestPanel(
  shape: PPTShapeElement,
  panels: readonly PPTShapeElement[],
): PPTShapeElement | undefined {
  if (panels.length === 0) return undefined;
  const center = shapeCenter(shape);
  let nearest = panels[0]!;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const panel of panels) {
    const panelCenter = shapeCenter(panel);
    const distance =
      (center.x - panelCenter.x) ** 2 + (center.y - panelCenter.y) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      nearest = panel;
    }
  }
  return nearest;
}

/**
 * Assigns stable palette slots to card panels (reading order) and pairs accent strips
 * with their nearest panel so identical AI fills still get distinct template colors.
 */
export function buildPanelSlotAssignments(
  shapes: readonly PPTShapeElement[],
): Map<string, number> {
  const panels = shapes
    .filter(isContentPanelShape)
    .sort((left, right) => left.top - right.top || left.left - right.left);
  const strips = shapes.filter(isAccentStripShape);
  const assignments = new Map<string, number>();

  panels.forEach((panel, index) => {
    assignments.set(panel.id, index);
  });

  for (const strip of strips) {
    const panel = findNearestPanel(strip, panels);
    assignments.set(strip.id, panel ? assignments.get(panel.id)! : 0);
  }

  return assignments;
}

function resolvePanelSlot(
  shape: PPTShapeElement,
  panelSlots: Map<string, number> | undefined,
): number | undefined {
  if (!panelSlots?.has(shape.id)) return undefined;
  return panelSlots.get(shape.id)!;
}

export interface ResolvedSlideThemeGraphics {
  readonly contentBlockColors: readonly string[];
  readonly mutedBlockFill: string;
  readonly lineColor: string;
  readonly blockOutlineColor: string;
  readonly chartColors: readonly string[];
}

/** Derives harmonious content-block fills when not explicitly set on the template. */
export function deriveContentBlockColors(theme: SlideTheme): string[] {
  if (theme.contentBlockColors && theme.contentBlockColors.length > 0) {
    return [...theme.contentBlockColors];
  }

  const bg = tinycolor(theme.backgroundColor);
  if (bg.isDark()) {
    return mixDistinctContentBlockFills(theme.backgroundColor, theme.themeColors);
  }

  return theme.themeColors.map((color) =>
    tinycolor.mix(color, '#ffffff', 84).desaturate(12).toHexString(),
  );
}

export function resolveSlideThemeGraphics(theme: SlideTheme): ResolvedSlideThemeGraphics {
  const contentBlockColors = deriveContentBlockColors(theme);
  const bg = tinycolor(theme.backgroundColor);
  const primary = theme.themeColors[0] ?? theme.fontColor;

  const mutedBlockFill =
    theme.mutedBlockFill ??
    (bg.isDark()
      ? tinycolor.mix(theme.backgroundColor, primary, 12).toHexString()
      : tinycolor.mix(theme.backgroundColor, '#f1f5f9', 35).toHexString());

  return {
    contentBlockColors,
    mutedBlockFill,
    lineColor: theme.lineColor ?? primary,
    blockOutlineColor: theme.blockOutlineColor ?? theme.outline?.color ?? primary,
    chartColors: theme.chartColors ?? theme.themeColors,
  };
}

/** Maps old content-block / accent fills to the new template block palette by slot index. */
export function buildGraphicsColorRemap(
  oldTheme: SlideTheme,
  newTheme: SlideTheme,
): Map<string, string> {
  const oldBlocks = deriveContentBlockColors(oldTheme);
  const newBlocks = deriveContentBlockColors(newTheme);
  const fallback = newBlocks[0] ?? newTheme.themeColors[0];
  const map = new Map<string, string>();

  const register = (oldColor: string | undefined, newColor: string) => {
    const key = oldColor ? normalizeColorKey(oldColor) : null;
    if (!key || map.has(key)) return;
    map.set(key, newColor);
  };

  oldBlocks.forEach((oldColor, index) => {
    register(oldColor, newBlocks[index] ?? newBlocks[newBlocks.length - 1] ?? fallback);
  });

  oldTheme.themeColors.forEach((oldColor, index) => {
    register(oldColor, newBlocks[index] ?? fallback);
  });

  if (oldTheme.contentBlockColors) {
    oldTheme.contentBlockColors.forEach((oldColor, index) => {
      register(oldColor, newBlocks[index] ?? fallback);
    });
  }

  if (oldTheme.mutedBlockFill) {
    register(oldTheme.mutedBlockFill, resolveSlideThemeGraphics(newTheme).mutedBlockFill);
  }

  return map;
}

function colorDistance(a: string, b: string): number {
  const left = tinycolor(a).toRgb();
  const right = tinycolor(b).toRgb();
  return Math.sqrt(
    (left.r - right.r) ** 2 + (left.g - right.g) ** 2 + (left.b - right.b) ** 2,
  );
}

/** Picks the content-block slot index that best matches a fill color on the old theme. */
export function closestContentBlockIndex(fill: string, theme: SlideTheme): number {
  const blocks = deriveContentBlockColors(theme);
  const candidates = [...blocks, ...theme.themeColors];
  if (candidates.length === 0) return 0;

  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  candidates.forEach((candidate, index) => {
    const distance = colorDistance(fill, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index % blocks.length;
    }
  });

  return bestIndex;
}

function resolveBlockFill(
  currentFill: string,
  oldTheme: SlideTheme,
  graphics: ResolvedSlideThemeGraphics,
  graphicsMap: Map<string, string>,
): string {
  const mapped = remapColor(currentFill, graphicsMap);
  if (mapped !== currentFill) return mapped;

  const slot = closestContentBlockIndex(currentFill, oldTheme);
  return graphics.contentBlockColors[slot] ?? graphics.contentBlockColors[0]!;
}

/** True when fill is a soft panel / near-background surface, not a saturated accent block. */
function isMutedSurfaceFill(fill: string, oldTheme: SlideTheme): boolean {
  const fillTiny = tinycolor(fill);
  if (!fillTiny.isValid()) return false;

  const fillKey = normalizeColorKey(fill);
  if (
    oldTheme.mutedBlockFill &&
    fillKey === normalizeColorKey(oldTheme.mutedBlockFill)
  ) {
    return true;
  }

  const bgTiny = tinycolor(oldTheme.backgroundColor);
  // Light slides: white card fills match the canvas — tint them as content blocks, not panels.
  if (fillKey === normalizeColorKey(oldTheme.backgroundColor)) {
    return bgTiny.isDark();
  }

  const blocks = deriveContentBlockColors(oldTheme);
  const blockColor = blocks[closestContentBlockIndex(fill, oldTheme)];
  if (!blockColor) return false;

  const blockDist = colorDistance(fill, blockColor);
  const themeDist = Math.min(
    ...oldTheme.themeColors.map((accent) => colorDistance(fill, accent)),
    Number.POSITIVE_INFINITY,
  );

  if (blockDist < themeDist * 0.9) {
    return fillTiny.getBrightness() > 200 || fillTiny.getLuminance() > 0.9;
  }

  if (bgTiny.isDark()) {
    return fillTiny.getLuminance() > 0.35 && fillTiny.getBrightness() > 160;
  }

  return false;
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

function resolveBlockAccent(theme: SlideTheme, slot: number): string {
  const accents = theme.blockAccentHues ?? theme.themeColors;
  return accents[slot % accents.length]!;
}

function resolveShapeBlockOutline(
  shape: PPTShapeElement,
  resolvedFill: string,
  graphics: ResolvedSlideThemeGraphics,
  oldTheme: SlideTheme,
  newTheme: SlideTheme,
  panelSlot?: number,
): PPTElementOutline {
  const slot =
    panelSlot ??
    closestContentBlockIndex(resolvedFill, newTheme);
  const slotAccent = resolveBlockAccent(newTheme, slot);

  if (isClassicOfficeSlideTheme(newTheme)) {
    return { style: 'solid', width: 3, color: slotAccent };
  }

  if (tinycolor(newTheme.backgroundColor).isDark()) {
    if (isAccentStripShape(shape)) {
      return {
        style: 'solid',
        width: 0,
        color: resolvedFill,
      };
    }
    if (isContentPanelShape(shape)) {
      return {
        style: 'solid',
        width: 1,
        color: harmonizePanelBorderColor(slotAccent, resolvedFill),
      };
    }
    return {
      style: shape.outline?.style ?? 'solid',
      width: Math.max(shape.outline?.width ?? 1, 2),
      color: accentFromContentBlockFill(resolvedFill, slotAccent),
    };
  }

  return {
    style: shape.outline?.style ?? 'solid',
    width: shape.outline?.width ?? 1,
    color: graphics.blockOutlineColor,
  };
}

function resolveDarkShapeFill(
  shape: PPTShapeElement,
  graphics: ResolvedSlideThemeGraphics,
  newTheme: SlideTheme,
  panelSlot: number | undefined,
  oldTheme: SlideTheme,
  graphicsMap: Map<string, string>,
): string {
  if (isTitleBandShape(shape) || isCanvasRailShape(shape)) {
    return graphics.mutedBlockFill;
  }

  if (panelSlot !== undefined) {
    const slot = panelSlot % graphics.contentBlockColors.length;
    if (isAccentStripShape(shape)) {
      return softenAccentForRail(resolveBlockAccent(newTheme, slot));
    }
    if (isContentPanelShape(shape)) {
      return graphics.contentBlockColors[slot]!;
    }
  }

  if (isMutedSurfaceFill(shape.fill, oldTheme)) {
    return graphics.mutedBlockFill;
  }

  return resolveBlockFill(shape.fill, oldTheme, graphics, graphicsMap);
}

function applyGraphicsToShape(
  shape: PPTShapeElement,
  graphics: ResolvedSlideThemeGraphics,
  graphicsMap: Map<string, string>,
  oldTheme: SlideTheme,
  newTheme: SlideTheme,
  panelSlots?: Map<string, number>,
): PPTShapeElement {
  const isDark = tinycolor(newTheme.backgroundColor).isDark();
  const panelSlot = isDark ? resolvePanelSlot(shape, panelSlots) : undefined;
  const fill =
    isDark && !isClassicOfficeSlideTheme(newTheme)
      ? resolveDarkShapeFill(shape, graphics, newTheme, panelSlot, oldTheme, graphicsMap)
      : isMutedSurfaceFill(shape.fill, oldTheme)
        ? graphics.mutedBlockFill
        : resolveBlockFill(shape.fill, oldTheme, graphics, graphicsMap);

  const isPremiumPanel =
    panelSlot !== undefined &&
    isContentPanelShape(shape) &&
    !isClassicOfficeSlideTheme(newTheme);

  const panelFill = fill;
  const panelGradient = isPremiumPanel
    ? buildPremiumPanelGradient(panelFill)
    : remapGradient(shape.gradient, graphicsMap);

  return {
    ...shape,
    fill: panelFill,
    gradient: panelGradient,
    outline: resolveShapeBlockOutline(shape, panelFill, graphics, oldTheme, newTheme, panelSlot),
    shadow: isPremiumPanel ? newTheme.shadow ?? shape.shadow : isClassicOfficeSlideTheme(newTheme) ? undefined : shape.shadow,
  };
}

/** Applies content-block, line, and chart colors from the template graphics system. */
export function applyThemeGraphicsToElement(
  element: PPTElement,
  graphicsMap: Map<string, string>,
  graphics: ResolvedSlideThemeGraphics,
  oldTheme: SlideTheme,
  newTheme: SlideTheme,
  panelSlots?: Map<string, number>,
): PPTElement {
  const el = structuredClone(element);

  switch (el.type) {
    case 'text': {
      if (el.fill) {
        el.fill = isMutedSurfaceFill(el.fill, oldTheme)
          ? graphics.mutedBlockFill
          : resolveBlockFill(el.fill, oldTheme, graphics, graphicsMap);
      }
      if (el.outline?.color) {
        el.outline = { ...el.outline, color: graphics.blockOutlineColor };
      }
      break;
    }
    case 'shape': {
      const updated = applyGraphicsToShape(
        el,
        graphics,
        graphicsMap,
        oldTheme,
        newTheme,
        panelSlots,
      );
      Object.assign(el, updated);
      break;
    }
    case 'line':
      el.color = graphics.lineColor;
      break;
    case 'chart':
      el.themeColors = [...graphics.chartColors];
      if (el.fill) {
        el.fill = resolveBlockFill(el.fill, oldTheme, graphics, graphicsMap);
      }
      el.lineColor = graphics.lineColor;
      if (el.textColor) {
        el.textColor = newTheme.bodyFontColor ?? newTheme.fontColor;
      }
      if (el.outline?.color) {
        el.outline = { ...el.outline, color: graphics.blockOutlineColor };
      }
      break;
    case 'table':
      if (el.theme?.color) {
        el.theme = { ...el.theme, color: graphics.contentBlockColors[0]! };
      }
      if (el.outline?.color) {
        el.outline = { ...el.outline, color: graphics.blockOutlineColor };
      }
      el.data = el.data.map((row) =>
        row.map((cell) => {
          if (!cell.style?.backcolor) return cell;
          return {
            ...cell,
            style: {
              ...cell.style,
              backcolor: isMutedSurfaceFill(cell.style.backcolor, oldTheme)
                ? graphics.mutedBlockFill
                : resolveBlockFill(cell.style.backcolor, oldTheme, graphics, graphicsMap),
            },
          };
        }),
      );
      break;
    case 'latex':
      if (el.color) el.color = remapColor(el.color, graphicsMap);
      break;
    default:
      break;
  }

  return el;
}

export function applyThemeGraphicsToElements(
  elements: readonly PPTElement[],
  newTheme: SlideTheme,
  oldTheme: SlideTheme,
): PPTElement[] {
  const graphics = resolveSlideThemeGraphics(newTheme);
  const graphicsMap = buildGraphicsColorRemap(oldTheme, newTheme);
  const isDarkBusiness =
    tinycolor(newTheme.backgroundColor).isDark() && !isClassicOfficeSlideTheme(newTheme);
  const panelSlots = isDarkBusiness
    ? buildPanelSlotAssignments(
        elements.filter((element) => element.type === 'shape') as PPTShapeElement[],
      )
    : undefined;

  return elements.map((element) =>
    applyThemeGraphicsToElement(element, graphicsMap, graphics, oldTheme, newTheme, panelSlots),
  );
}

interface BlockColorSlot {
  index: number;
}

function takeContentBlockColor(
  graphics: ResolvedSlideThemeGraphics,
  slot: BlockColorSlot,
): string {
  const blocks = graphics.contentBlockColors;
  const color = blocks[slot.index % blocks.length]!;
  slot.index += 1;
  return color;
}

function forceBlockOutline(graphics: ResolvedSlideThemeGraphics): {
  style: 'solid';
  width: number;
  color: string;
} {
  return { style: 'solid', width: 1, color: graphics.blockOutlineColor };
}

/** Forces template graphics onto a single element (no color remapping). */
export function forceApplyThemeGraphicsToElement(
  element: PPTElement,
  graphics: ResolvedSlideThemeGraphics,
  newTheme: SlideTheme,
  blockSlot: BlockColorSlot,
  panelSlots?: Map<string, number>,
): PPTElement {
  const el = structuredClone(element);
  const typographyBody = newTheme.bodyFontColor ?? newTheme.fontColor;
  const isDark = tinycolor(newTheme.backgroundColor).isDark();

  switch (el.type) {
    case 'text': {
      if (el.fill) {
        el.fill = graphics.mutedBlockFill;
      }
      if (el.outline?.color) {
        el.outline = forceBlockOutline(graphics);
      }
      break;
    }
    case 'shape': {
      const panelSlot = isDark ? resolvePanelSlot(el, panelSlots) : undefined;
      if (panelSlot !== undefined) {
        const slot = panelSlot % graphics.contentBlockColors.length;
        if (isAccentStripShape(el)) {
          el.fill = softenAccentForRail(resolveBlockAccent(newTheme, slot));
          el.outline = { style: 'solid', width: 0, color: el.fill };
        } else if (isContentPanelShape(el) || isTitleBandShape(el) || isCanvasRailShape(el)) {
          el.fill = isTitleBandShape(el) || isCanvasRailShape(el)
            ? graphics.mutedBlockFill
            : graphics.contentBlockColors[slot]!;
          const accent = resolveBlockAccent(newTheme, slot);
          el.outline = isContentPanelShape(el)
            ? {
                style: 'solid',
                width: 1,
                color: harmonizePanelBorderColor(accent, el.fill),
              }
            : forceBlockOutline(graphics);
          if (isContentPanelShape(el)) {
            el.gradient = buildPremiumPanelGradient(el.fill);
          }
        } else {
          el.fill = takeContentBlockColor(graphics, blockSlot);
          el.outline = forceBlockOutline(graphics);
        }
      } else {
        el.fill = takeContentBlockColor(graphics, blockSlot);
        el.outline = forceBlockOutline(graphics);
      }
      el.gradient = undefined;
      break;
    }
    case 'line':
      el.color = graphics.lineColor;
      break;
    case 'chart':
      el.themeColors = [...graphics.chartColors];
      el.fill = graphics.contentBlockColors[0]!;
      el.lineColor = graphics.lineColor;
      el.textColor = typographyBody;
      el.outline = forceBlockOutline(graphics);
      break;
    case 'table': {
      if (el.theme?.color) {
        el.theme = { ...el.theme, color: graphics.contentBlockColors[0]! };
      }
      el.outline = forceBlockOutline(graphics);
      el.data = el.data.map((row, rowIndex) =>
        row.map((cell) => {
          if (!cell.style?.backcolor) return cell;
          const backcolor =
            rowIndex === 0
              ? takeContentBlockColor(graphics, blockSlot)
              : graphics.mutedBlockFill;
          return {
            ...cell,
            style: { ...cell.style, backcolor },
          };
        }),
      );
      break;
    }
    case 'latex':
      if (el.color) el.color = typographyBody;
      break;
    default:
      break;
  }

  return el;
}

export function forceApplyThemeGraphicsToElements(
  elements: readonly PPTElement[],
  newTheme: SlideTheme,
): PPTElement[] {
  const graphics = resolveSlideThemeGraphics(newTheme);
  const blockSlot: BlockColorSlot = { index: 0 };
  const isDark = tinycolor(newTheme.backgroundColor).isDark();
  const panelSlots = isDark
    ? buildPanelSlotAssignments(
        elements.filter((element) => element.type === 'shape') as PPTShapeElement[],
      )
    : undefined;

  return elements.map((element) =>
    forceApplyThemeGraphicsToElement(element, graphics, newTheme, blockSlot, panelSlots),
  );
}

export function forceApplyThemeGraphicsToCanvas(slide: Slide, newTheme: SlideTheme): Slide {
  return {
    ...slide,
    theme: { ...newTheme },
    elements: forceApplyThemeGraphicsToElements(slide.elements, newTheme),
  };
}

export function applyThemeGraphicsToCanvas(
  slide: Slide,
  newTheme: SlideTheme,
  oldTheme?: SlideTheme,
): Slide {
  const priorTheme = oldTheme ?? slide.theme;
  return {
    ...slide,
    theme: { ...newTheme },
    elements: applyThemeGraphicsToElements(slide.elements, newTheme, priorTheme),
  };
}
