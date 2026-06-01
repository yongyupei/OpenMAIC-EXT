/**
 * @extends-from lib/prompts/generation-prompt-allowlist.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import type { PromptId } from '@/lib/prompts/types';
import type { PromptOverride } from '@/lib/teacher/generation-profile';

/** Prompts teachers may override via generation profile (built-in files stay read-only). */
export const GENERATION_PROMPT_ALLOWLIST = [
  'requirements-to-outlines',
  'slide-content',
  'html-slide-content',
  'quiz-content',
  'slide-actions',
  'html-slide-actions',
  'quiz-actions',
  'interactive-actions',
  'pbl-actions',
] as const satisfies readonly PromptId[];

export type GenerationPromptAllowlistId = (typeof GENERATION_PROMPT_ALLOWLIST)[number];

export function isAllowedGenerationPromptId(id: string): id is GenerationPromptAllowlistId {
  return (GENERATION_PROMPT_ALLOWLIST as readonly string[]).includes(id);
}

export function sanitizePromptOverrides(
  overrides: Record<string, PromptOverride> | undefined,
): Partial<Record<PromptId, PromptOverride>> | undefined {
  if (!overrides) return undefined;
  const sanitized: Partial<Record<PromptId, PromptOverride>> = {};
  for (const [id, value] of Object.entries(overrides)) {
    if (!isAllowedGenerationPromptId(id)) continue;
    sanitized[id] = value;
  }
  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}
