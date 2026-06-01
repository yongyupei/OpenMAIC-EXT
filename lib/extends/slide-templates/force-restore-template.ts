/**
 * @extends-from lib/slide-templates/force-restore-template.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { isClassicOfficeSlideTheme } from '@/lib/slide-templates/default-office-theme';
import type { PPTElement, PPTElementOutline, PPTShapeElement, PPTTextElement, Slide, SlideTheme } from '@/lib/types/slides';
import {
  buildPanelSlotAssignments,
  isAccentStripShape,
  isContentPanelShape,
  isTitleBandShape,
  isCanvasRailShape,
  resolveSlideThemeGraphics,
  type ResolvedSlideThemeGraphics,
} from '@/lib/slide-templates/theme-graphics';
import { accentFromContentBlockFill, cardTextColorForAccent, harmonizePanelBorderColor, softenAccentForRail } from '@/lib/slide-templates/palette-utils';
import {
  inferTextType,
  resolveSlideThemeTypography,
  type ResolvedSlideThemeTypography,
} from '@/lib/slide-templates/theme-typography';
import {
  forceHtmlTextStyles,
  resolveForceElementOutline,
  resolveForceElementShadow,
  resolveForceTextStyle,
} from '@/lib/slide-templates/theme-force-styles';

interface BlockColorSlot {
  index: number;
}

interface ForceRestoreContext {
  readonly theme: SlideTheme;
  readonly typography: ResolvedSlideThemeTypography;
  readonly graphics: ResolvedSlideThemeGraphics;
  readonly blockSlot: BlockColorSlot;
  readonly panelSlots?: Map<string, number>;
}

function resolveBlockAccent(theme: SlideTheme, slot: number): string {
  const accents = theme.blockAccentHues ?? theme.themeColors;
  return accents[slot % accents.length]!;
}

function shapeContainsPoint(shape: PPTShapeElement, x: number, y: number): boolean {
  return (
    x >= shape.left &&
    x <= shape.left + shape.width &&
    y >= shape.top &&
    y <= shape.top + shape.height
  );
}

function takeContentBlockColor(ctx: ForceRestoreContext): string {
  const blocks = ctx.graphics.contentBlockColors;
  const color = blocks[ctx.blockSlot.index % blocks.length]!;
  ctx.blockSlot.index += 1;
  return color;
}

function takeShapeFillColor(ctx: ForceRestoreContext): string {
  return takeContentBlockColor(ctx);
}

function takeShapeAccentOutline(ctx: ForceRestoreContext): PPTElementOutline {
  const slotIndex = Math.max(0, ctx.blockSlot.index - 1);
  if (isClassicOfficeSlideTheme(ctx.theme)) {
    const accent = ctx.theme.themeColors[slotIndex % ctx.theme.themeColors.length]!;
    return { style: 'solid', width: 3, color: accent };
  }
  return resolveForceElementOutline(ctx.theme, ctx.graphics);
}

function resolveForceTextStyleForContext(
  textType: Parameters<typeof resolveForceTextStyle>[0],
  ctx: ForceRestoreContext,
): ReturnType<typeof resolveForceTextStyle> {
  const style = resolveForceTextStyle(textType, ctx.typography);
  if (!isClassicOfficeSlideTheme(ctx.theme)) {
    return style;
  }
  if (textType === 'subtitle' || textType === 'notes') {
    return { ...style, color: ctx.typography.titleFontColor };
  }
  if (textType === 'itemTitle' || textType === 'header') {
    const accent =
      ctx.theme.themeColors[ctx.blockSlot.index % ctx.theme.themeColors.length]!;
    return { ...style, color: accent, bold: true };
  }
  return style;
}

function applyForceTextContent(
  content: string,
  textType: Parameters<typeof resolveForceTextStyle>[0],
  ctx: ForceRestoreContext,
): { content: string; defaultColor: string; defaultFontName: string } {
  const style = resolveForceTextStyleForContext(textType, ctx);
  if (
    isClassicOfficeSlideTheme(ctx.theme) &&
    (textType === 'itemTitle' || textType === 'header')
  ) {
    ctx.blockSlot.index += 1;
  }
  return {
    content: forceHtmlTextStyles(content, style),
    defaultColor: style.color,
    defaultFontName: style.fontName,
  };
}

function forceRestoreTextElement(
  el: PPTTextElement,
  ctx: ForceRestoreContext,
): PPTTextElement {
  const textType = el.textType ?? inferTextType(el) ?? 'content';
  const applied = applyForceTextContent(el.content, textType, ctx);
  const outline = resolveForceElementOutline(ctx.theme, ctx.graphics);

  return {
    ...el,
    textType,
    content: applied.content,
    defaultColor: applied.defaultColor,
    defaultFontName: applied.defaultFontName,
    fill: el.fill ? ctx.graphics.mutedBlockFill : undefined,
    outline: el.fill || el.outline ? outline : undefined,
    shadow: resolveForceElementShadow(ctx.theme),
    opacity: 1,
  };
}

/** Fully restores one element to the target template (no palette remapping). */
export function forceRestoreElement(element: PPTElement, ctx: ForceRestoreContext): PPTElement {
  const el = structuredClone(element);
  const outline = resolveForceElementOutline(ctx.theme, ctx.graphics);
  const shadow = resolveForceElementShadow(ctx.theme);
  const bodyColor = ctx.typography.bodyFontColor;

  switch (el.type) {
    case 'text':
      return forceRestoreTextElement(el, ctx);
    case 'shape': {
      const panelSlot = ctx.panelSlots?.get(el.id);
      const isDark = !isClassicOfficeSlideTheme(ctx.theme);
      let fill: string;
      let shapeOutline: PPTElementOutline;

      if (isDark && panelSlot !== undefined) {
        const slot = panelSlot % ctx.graphics.contentBlockColors.length;
        if (isAccentStripShape(el)) {
          fill = softenAccentForRail(resolveBlockAccent(ctx.theme, slot));
          shapeOutline = { style: 'solid', width: 0, color: fill };
        } else if (isTitleBandShape(el) || isCanvasRailShape(el)) {
          fill = ctx.graphics.mutedBlockFill;
          shapeOutline = resolveForceElementOutline(ctx.theme, ctx.graphics);
        } else if (isContentPanelShape(el)) {
          fill = ctx.graphics.contentBlockColors[slot]!;
          const accent = resolveBlockAccent(ctx.theme, slot);
          shapeOutline = {
            style: 'solid',
            width: 1,
            color: harmonizePanelBorderColor(accent, fill),
          };
        } else {
          fill = takeShapeFillColor(ctx);
          shapeOutline = takeShapeAccentOutline(ctx);
        }
      } else {
        fill = takeShapeFillColor(ctx);
        shapeOutline = takeShapeAccentOutline(ctx);
      }

      const next: typeof el = {
        ...el,
        fill,
        gradient: undefined,
        pattern: undefined,
        opacity: 1,
        outline: shapeOutline,
        shadow: isClassicOfficeSlideTheme(ctx.theme) ? undefined : shadow,
      };
      if (el.text) {
        const textType = el.text.type ?? 'content';
        const applied = applyForceTextContent(el.text.content, textType, ctx);
        next.text = {
          ...el.text,
          type: textType,
          content: applied.content,
          defaultColor: applied.defaultColor,
          defaultFontName: applied.defaultFontName,
        };
      }
      return next;
    }
    case 'line':
      return {
        ...el,
        color: ctx.graphics.lineColor,
        style: 'solid',
        shadow,
      };
    case 'image':
      return {
        ...el,
        outline,
        shadow,
        colorMask: undefined,
      };
    case 'chart':
      return {
        ...el,
        themeColors: [...ctx.graphics.chartColors],
        fill: ctx.graphics.contentBlockColors[0]!,
        lineColor: ctx.graphics.lineColor,
        textColor: bodyColor,
        outline,
      };
    case 'table': {
      const headerColor = takeContentBlockColor(ctx);
      return {
        ...el,
        outline,
        theme: {
          color: ctx.graphics.contentBlockColors[0]!,
          rowHeader: el.theme?.rowHeader ?? true,
          rowFooter: el.theme?.rowFooter ?? false,
          colHeader: el.theme?.colHeader ?? false,
          colFooter: el.theme?.colFooter ?? false,
        },
        data: el.data.map((row, rowIndex) =>
          row.map((cell) => ({
            ...cell,
            style: {
              bold: rowIndex === 0,
              color: rowIndex === 0 ? ctx.typography.titleFontColor : bodyColor,
              fontname: rowIndex === 0 ? ctx.typography.titleFontName : ctx.typography.bodyFontName,
              fontsize: rowIndex === 0 ? '16px' : '14px',
              backcolor: rowIndex === 0 ? headerColor : undefined,
              align: cell.style?.align,
            },
          })),
        ),
      };
    }
    case 'latex':
      return {
        ...el,
        color: bodyColor,
      };
    case 'audio':
      return {
        ...el,
        color: ctx.graphics.lineColor,
      };
    case 'code':
      return {
        ...el,
        fontSize: 14,
      };
    case 'video':
      return el;
    default:
      return el;
  }
}

/**
 * Replaces slide theme and overwrites every element's visual styles from the target template.
 * Used for "reset to default" — does not remap from the previous theme palette.
 */
export function forceRestoreSlideToTemplate(slide: Slide, theme: SlideTheme): Slide {
  const isDark = !isClassicOfficeSlideTheme(theme);
  const panelSlots = isDark
    ? buildPanelSlotAssignments(
        slide.elements.filter((element) => element.type === 'shape') as PPTShapeElement[],
      )
    : undefined;
  const ctx: ForceRestoreContext = {
    theme,
    typography: resolveSlideThemeTypography(theme),
    graphics: resolveSlideThemeGraphics(theme),
    blockSlot: { index: 0 },
    panelSlots,
  };

  return {
    ...slide,
    theme: { ...theme },
    background: { type: 'solid', color: theme.backgroundColor },
    elements: slide.elements.map((element) => forceRestoreElement(element, ctx)),
  };
}
