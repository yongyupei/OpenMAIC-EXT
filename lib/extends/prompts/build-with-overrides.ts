/**
 * @extends-from lib/prompts/build-with-overrides.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { buildPrompt } from './loader';
import type { PromptId } from './types';
import type { PromptOverride } from '@/lib/teacher/generation-profile';

/**
 * Builds a prompt from built-in templates, applying teacher flow overrides only.
 * Never writes to template files on disk.
 */
export function buildPromptWithOverrides(
  promptId: PromptId,
  variables: Record<string, unknown>,
  overrides?: Partial<Record<PromptId, PromptOverride>>,
): { system: string; user: string } | null {
  const base = buildPrompt(promptId, variables);
  if (!base) return null;

  const override = overrides?.[promptId];
  if (!override) return base;

  return {
    system: override.system?.trim() ? override.system.trim() : base.system,
    user: override.user?.trim() ? override.user.trim() : base.user,
  };
}
