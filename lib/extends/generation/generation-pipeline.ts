/**
 * Two-Stage Generation Pipeline
 *
 * Barrel re-export — all symbols previously exported from this file
 * are now spread across focused sub-modules.
 */

// Types
export type {
  AgentInfo,
  SceneGenerationContext,
  GeneratedSlideData,
  GenerationResult,
  GenerationCallbacks,
  AICallFn,
} from '@/lib/generation/pipeline-types';

// Prompt formatters
export {
  buildCourseContext,
  formatAgentsForPrompt,
  formatTeacherPersonaForPrompt,
  formatImageDescription,
  formatImagePlaceholder,
  buildVisionUserContent,
  buildLanguageText,
} from '@/lib/generation/prompt-formatters';

// JSON repair
export { parseJsonResponse, tryParseJson } from '@/lib/generation/json-repair';

// Outline generator (Stage 1)
export { generateSceneOutlinesFromRequirements, applyOutlineFallbacks } from '@/lib/generation/outline-generator';

// Scene generator (Stage 2)
export {
  generateFullScenes,
  generateSceneContent,
  generateSceneActions,
  createSceneWithActions,
} from '@/lib/generation/scene-generator';
export type { SceneContentOptions, SceneActionsOptions } from '@/lib/generation/scene-generator';

// Scene builder (standalone)
export {
  buildSceneFromOutline,
  uniquifyMediaElementIds,
} from '@/lib/generation/scene-builder';
export { buildCompleteScene } from '@/lib/generation/scene-assembler';
export type { BuildCompleteSceneOptions } from '@/lib/generation/scene-assembler';

// Pipeline runner
export { createGenerationSession, runGenerationPipeline } from '@/lib/generation/pipeline-runner';
