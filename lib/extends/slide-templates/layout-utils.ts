/**
 * @extends-from lib/slide-templates/layout-utils.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { createLogger } from '@/lib/logger';
import type { SceneOutline } from '@/lib/types/generation';
import type { SlideLayoutPreset } from '@/lib/slide-templates/types';

const log = createLogger('SlideTemplates');

const DEFAULT_LAYOUT_ID = 'title-bullets';

export interface PositionedBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type PositionedElement = PositionedBox & Record<string, unknown>;

function hasPositionBox(el: unknown): el is PositionedElement {
  if (!el || typeof el !== 'object') return false;
  const candidate = el as Record<string, unknown>;
  return (
    typeof candidate.left === 'number' &&
    typeof candidate.top === 'number' &&
    typeof candidate.width === 'number' &&
    typeof candidate.height === 'number'
  );
}

/** Bounding box that encloses all slots in a layout preset. */
export function getLayoutSlotBounds(layout: SlideLayoutPreset): PositionedBox {
  const { slots } = layout;
  if (slots.length === 0) {
    return { left: 0, top: 0, width: 1000, height: 562.5 };
  }

  const minLeft = Math.min(...slots.map((s) => s.left));
  const minTop = Math.min(...slots.map((s) => s.top));
  const maxRight = Math.max(...slots.map((s) => s.left + s.width));
  const maxBottom = Math.max(...slots.map((s) => s.top + s.height));

  return {
    left: minLeft,
    top: minTop,
    width: maxRight - minLeft,
    height: maxBottom - minTop,
  };
}

export function pickLayoutForOutline(
  outline: SceneOutline,
  layouts: SlideLayoutPreset[],
): SlideLayoutPreset {
  const suggestedId = outline.suggestedLayoutId;
  if (suggestedId) {
    const match = layouts.find((l) => l.id === suggestedId);
    if (match) return match;
  }

  const fallback = layouts.find((l) => l.id === DEFAULT_LAYOUT_ID);
  if (fallback) return fallback;

  return (
    layouts[0] ?? {
      id: DEFAULT_LAYOUT_ID,
      label: 'Title and bullets',
      promptHint: '',
      slots: [],
    }
  );
}

export function formatLayoutSlotsForPrompt(layout: SlideLayoutPreset): string {
  return JSON.stringify(layout.slots);
}

function clampBox(box: PositionedBox, bounds: PositionedBox): PositionedBox {
  let { left, top, width, height } = box;
  const maxRight = bounds.left + bounds.width;
  const maxBottom = bounds.top + bounds.height;

  if (width > bounds.width) width = bounds.width;
  if (height > bounds.height) height = bounds.height;
  if (width < 0) width = 0;
  if (height < 0) height = 0;

  if (left < bounds.left) left = bounds.left;
  if (top < bounds.top) top = bounds.top;
  if (left + width > maxRight) left = maxRight - width;
  if (top + height > maxBottom) top = maxBottom - height;

  if (left < bounds.left) left = bounds.left;
  if (top < bounds.top) top = bounds.top;

  return { left, top, width, height };
}

/**
 * Clamp element left/top/width/height so each box stays within the layout slot union.
 */
export function clampElementsToSlots<T extends Record<string, unknown>>(
  elements: T[],
  layout: SlideLayoutPreset,
): T[] {
  const bounds = getLayoutSlotBounds(layout);

  return elements.map((element) => {
    if (!hasPositionBox(element)) return element;

    const clamped = clampBox(element, bounds);
    const changed =
      clamped.left !== element.left ||
      clamped.top !== element.top ||
      clamped.width !== element.width ||
      clamped.height !== element.height;

    if (changed) {
      log.warn(
        `Clamped element to layout "${layout.id}" bounds (left=${clamped.left}, top=${clamped.top}, width=${clamped.width}, height=${clamped.height})`,
      );
    }

    return { ...element, ...clamped };
  });
}

const SOFT_LAYOUT_TOLERANCE_PX = 20;

function isOutsideSoftBounds(element: PositionedBox, bounds: PositionedBox): boolean {
  const tolerance = SOFT_LAYOUT_TOLERANCE_PX;
  return (
    element.left < bounds.left - tolerance ||
    element.top < bounds.top - tolerance ||
    element.left + element.width > bounds.left + bounds.width + tolerance ||
    element.top + element.height > bounds.top + bounds.height + tolerance
  );
}

/** Logs when elements drift far outside layout slot union (generation uses hints only, no clamp). */
export function warnElementsOutsideSlots<T extends Record<string, unknown>>(
  elements: T[],
  layout: SlideLayoutPreset,
  contextLabel?: string,
): void {
  const bounds = getLayoutSlotBounds(layout);
  const label = contextLabel ?? layout.id;

  for (const element of elements) {
    if (!hasPositionBox(element)) continue;
    if (!isOutsideSoftBounds(element, bounds)) continue;

    log.debug(
      `Element outside layout "${label}" soft bounds (±${SOFT_LAYOUT_TOLERANCE_PX}px): left=${element.left}, top=${element.top}, width=${element.width}, height=${element.height}`,
    );
  }
}
