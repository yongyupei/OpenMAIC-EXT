/**
 * @extends-from lib/teacher/generation-prompt-catalog.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { GENERATION_PROMPT_ALLOWLIST } from '@/lib/prompts/generation-prompt-allowlist';
import type { GenerationPromptAllowlistId } from '@/lib/prompts/generation-prompt-allowlist';
import type { WorkflowStepType } from '@/lib/generation/workflow/workflow-schema';

export const PROMPT_OVERRIDE_MAX_CHARS = 24_000;

export interface GenerationPromptCatalogEntry {
  readonly id: GenerationPromptAllowlistId;
  /** Primary workflow step this prompt supports (for grouping in UI). */
  readonly stepType: WorkflowStepType;
  /** i18n key under teacher.design.promptCatalog.* */
  readonly labelKey: string;
  readonly descriptionKey: string;
}

export const GENERATION_PROMPT_CATALOG: GenerationPromptCatalogEntry[] = [
  {
    id: 'requirements-to-outlines',
    stepType: 'outline',
    labelKey: 'requirementsToOutlines',
    descriptionKey: 'requirementsToOutlinesDesc',
  },
  {
    id: 'slide-content',
    stepType: 'scene-content',
    labelKey: 'slideContent',
    descriptionKey: 'slideContentDesc',
  },
  {
    id: 'html-slide-content',
    stepType: 'scene-content',
    labelKey: 'htmlSlideContent',
    descriptionKey: 'htmlSlideContentDesc',
  },
  {
    id: 'quiz-content',
    stepType: 'scene-content',
    labelKey: 'quizContent',
    descriptionKey: 'quizContentDesc',
  },
  {
    id: 'slide-actions',
    stepType: 'scene-actions',
    labelKey: 'slideActions',
    descriptionKey: 'slideActionsDesc',
  },
  {
    id: 'html-slide-actions',
    stepType: 'scene-actions',
    labelKey: 'htmlSlideActions',
    descriptionKey: 'htmlSlideActionsDesc',
  },
  {
    id: 'quiz-actions',
    stepType: 'scene-actions',
    labelKey: 'quizActions',
    descriptionKey: 'quizActionsDesc',
  },
  {
    id: 'interactive-actions',
    stepType: 'scene-actions',
    labelKey: 'interactiveActions',
    descriptionKey: 'interactiveActionsDesc',
  },
  {
    id: 'pbl-actions',
    stepType: 'scene-actions',
    labelKey: 'pblActions',
    descriptionKey: 'pblActionsDesc',
  },
];

/** Ensures catalog stays aligned with server allowlist. */
export function assertPromptCatalogMatchesAllowlist(): void {
  const catalogIds = new Set(GENERATION_PROMPT_CATALOG.map((e) => e.id));
  for (const id of GENERATION_PROMPT_ALLOWLIST) {
    if (!catalogIds.has(id)) {
      throw new Error(`Missing catalog entry for allowlisted prompt: ${id}`);
    }
  }
}
