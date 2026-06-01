/**
 * @extends-from lib/teacher/preview-resume-helpers.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import type { SceneOutline } from '@/lib/types/generation';

type GenerationStatus = 'idle' | 'generating' | 'paused' | 'completed' | 'error';

/** True when at least one outline order has no matching scene. */
export function hasIncompleteOutlines(
  outlines: SceneOutline[],
  scenes: { order: number }[],
): boolean {
  if (outlines.length === 0) return false;
  const done = new Set(scenes.map((s) => s.order));
  return outlines.some((o) => !done.has(o.order));
}

/**
 * Local IndexedDB draft should offer "continue" (resume scene generation or retry after pause).
 */
export function localDraftLooksResumable(
  outlines: SceneOutline[],
  scenes: { order: number }[],
  generationStatus: GenerationStatus,
): boolean {
  if (outlines.length === 0) return false;
  if (hasIncompleteOutlines(outlines, scenes)) return true;
  return generationStatus === 'paused';
}

/**
 * After `loadFromStorage`, `generationStatus` is often still default `idle` even when the draft
 * is mid-flight or finished-but-not-published. Use this to decide whether to show the entry gate.
 */
export function teacherPreviewEntryShouldGate(
  outlines: SceneOutline[],
  scenes: { order: number }[],
  generationStatus: GenerationStatus,
): boolean {
  if (outlines.length === 0) return false;
  if (hasIncompleteOutlines(outlines, scenes)) return true;
  if (generationStatus === 'paused' || generationStatus === 'error') return true;
  const everyOutlineHasScene = outlines.every((o) => scenes.some((s) => s.order === o.order));
  return everyOutlineHasScene && scenes.length > 0;
}
