/**
 * Post-processes slide outlines before scene generation (Phase 3 quality gate).
 */
import type { SceneOutline } from '@/lib/types/generation';

export const SLIDE_KEY_POINTS_MAX = 5;
export const SLIDE_KEY_POINT_MAX_CHARS = 80;
export const SLIDE_VISUAL_HINT_MAX_CHARS = 120;
export const SLIDE_DESCRIPTION_MAX_CHARS = 240;

function trimToMax(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars).trimEnd()}…`;
}

/** Short phrase suitable for on-slide bullets (not narration). */
export function trimSlideKeyPoint(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return trimToMax(oneLine, SLIDE_KEY_POINT_MAX_CHARS);
}

/** Ensures slide outlines have scannable keyPoints and optional visualHint for downstream prompts. */
export function normalizeSlideOutlineForGeneration(outline: SceneOutline): SceneOutline {
  if (outline.type !== 'slide') {
    return outline;
  }

  const rawKeyPoints = outline.keyPoints ?? [];
  const keyPoints = rawKeyPoints
    .map(trimSlideKeyPoint)
    .filter((point) => point.length > 0)
    .slice(0, SLIDE_KEY_POINTS_MAX);

  const visualHint = outline.visualHint?.trim()
    ? trimToMax(outline.visualHint.trim(), SLIDE_VISUAL_HINT_MAX_CHARS)
    : undefined;

  const description = outline.description?.trim()
    ? trimToMax(outline.description.trim(), SLIDE_DESCRIPTION_MAX_CHARS)
    : outline.description;

  return {
    ...outline,
    description,
    keyPoints: keyPoints.length > 0 ? keyPoints : rawKeyPoints.slice(0, SLIDE_KEY_POINTS_MAX),
    ...(visualHint ? { visualHint } : {}),
  };
}

/** Normalizes all slide outlines in a batch (outline stage output). */
export function normalizeSlideOutlinesForGeneration(outlines: SceneOutline[]): SceneOutline[] {
  return outlines.map((outline) => normalizeSlideOutlineForGeneration(outline));
}
