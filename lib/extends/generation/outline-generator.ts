/**
 * Stage 1: Generate scene outlines from user requirements.
 * Also contains outline fallback logic.
 */

import { nanoid } from 'nanoid';
import { MAX_PDF_CONTENT_CHARS, MAX_VISION_IMAGES } from '@/lib/constants/generation';
import type {
  UserRequirements,
  SceneOutline,
  PdfImage,
  ImageMapping,
} from '@/lib/types/generation';
import { buildPromptWithOverrides } from '@/lib/prompts/build-with-overrides';
import { PROMPT_IDS } from '@/lib/prompts';
import type { PromptId } from '@/lib/prompts/types';
import type { PromptOverride } from '@/lib/teacher/generation-profile';
import { formatImageDescription, formatImagePlaceholder } from '@/lib/generation/prompt-formatters';
import { parseJsonResponse } from '@/lib/generation/json-repair';
import { uniquifyMediaElementIds } from '@/lib/generation/scene-builder';
import { normalizeSlideOutlinesForGeneration } from './outline-normalizer';
import type { AICallFn, GenerationResult, GenerationCallbacks } from '@/lib/generation/pipeline-types';
import type { GenerationMode } from '@/lib/slide-templates/types';
import { createLogger } from '@/lib/logger';
const log = createLogger('Generation');

/**
 * Used when the outline stage fails to produce an explicit directive (LLM
 * schema regression, empty response, upstream error). Downstream prompts
 * still need *something* that steers the model toward the requirement's
 * language rather than defaulting to the training-distribution prior.
 */
export const DEFAULT_LANGUAGE_DIRECTIVE =
  'Teach in the language that matches the user requirement.';

/**
 * Generate scene outlines from user requirements
 * Now uses simplified UserRequirements with just requirement text and language
 */
export async function generateSceneOutlinesFromRequirements(
  requirements: UserRequirements,
  pdfText: string | undefined,
  pdfImages: PdfImage[] | undefined,
  aiCall: AICallFn,
  callbacks?: GenerationCallbacks,
  options?: {
    visionEnabled?: boolean;
    imageMapping?: ImageMapping;
    imageGenerationEnabled?: boolean;
    videoGenerationEnabled?: boolean;
    researchContext?: string;
    teacherContext?: string;
    generationMode?: GenerationMode;
    slideOutputFormat?: import('@/lib/teacher/slide-output-format').SlideOutputFormat;
    promptOverrides?: Partial<Record<PromptId, PromptOverride>>;
  },
): Promise<GenerationResult<{ languageDirective: string; outlines: SceneOutline[] }>> {
  // Build available images description for the prompt
  let availableImagesText = 'No images available';
  let visionImages: Array<{ id: string; src: string }> | undefined;

  if (pdfImages && pdfImages.length > 0) {
    if (options?.visionEnabled && options?.imageMapping) {
      // Vision mode: split into vision images (first N) and text-only (rest)
      const allWithSrc = pdfImages.filter((img) => options.imageMapping![img.id]);
      const visionSlice = allWithSrc.slice(0, MAX_VISION_IMAGES);
      const textOnlySlice = allWithSrc.slice(MAX_VISION_IMAGES);
      const noSrcImages = pdfImages.filter((img) => !options.imageMapping![img.id]);

      const visionDescriptions = visionSlice.map((img) => formatImagePlaceholder(img));
      const textDescriptions = [...textOnlySlice, ...noSrcImages].map((img) =>
        formatImageDescription(img),
      );
      availableImagesText = [...visionDescriptions, ...textDescriptions].join('\n');

      visionImages = visionSlice.map((img) => ({
        id: img.id,
        src: options.imageMapping![img.id],
        width: img.width,
        height: img.height,
      }));
    } else {
      // Text-only mode: full descriptions
      availableImagesText = pdfImages.map((img) => formatImageDescription(img)).join('\n');
    }
  }

  // Build user profile string for prompt injection
  const userProfileText =
    requirements.userNickname || requirements.userBio
      ? `## Student Profile\n\nStudent: ${requirements.userNickname || 'Unknown'}${requirements.userBio ? ` — ${requirements.userBio}` : ''}\n\nConsider this student's background when designing the course. Adapt difficulty, examples, and teaching approach accordingly.\n\n---`
      : '';

  // Build media snippet conditions based on enabled flags.
  const imageEnabled = options?.imageGenerationEnabled ?? false;
  const videoEnabled = options?.videoGenerationEnabled ?? false;
  const mediaEnabled = imageEnabled || videoEnabled;
  const hasSourceImages = (pdfImages?.length ?? 0) > 0;

  const mode = options?.generationMode ?? 'requirement-driven';
  const materialDriven = mode === 'material-driven';
  const requirementDriven = mode === 'requirement-driven';
  const hybridMode = mode === 'hybrid';
  const htmlSlides = options?.slideOutputFormat === 'html' || requirements.slideOutputFormat === 'html';

  // Use simplified prompt variables
  const prompts = buildPromptWithOverrides(
    PROMPT_IDS.REQUIREMENTS_TO_OUTLINES,
    {
    // New simplified variables
    requirement: htmlSlides
      ? `${requirements.requirement}\n\n## Slide format\nGenerate slide-type scenes as full-page HTML motion slides (one HTML page per slide scene). Prefer slide scenes over static canvas descriptions.`
      : requirements.requirement,
    pdfContent: pdfText ? pdfText.substring(0, MAX_PDF_CONTENT_CHARS) : 'None',
    availableImages: availableImagesText,
    userProfile: userProfileText,
    hasSourceImages,
    imageEnabled,
    videoEnabled,
    mediaEnabled,
    researchContext: options?.researchContext || 'None',
    // Server-side generation populates this via options; client-side populates via formatTeacherPersonaForPrompt
    teacherContext: options?.teacherContext || '',
    materialDriven,
    requirementDriven,
    hybridMode,
    },
    options?.promptOverrides,
  );

  if (!prompts) {
    return { success: false, error: 'Prompt template not found' };
  }

  try {
    callbacks?.onProgress?.({
      currentStage: 1,
      overallProgress: 20,
      stageProgress: 50,
      statusMessage: '正在分析需求，生成场景大纲...',
      scenesGenerated: 0,
      totalScenes: 0,
    });

    const response = await aiCall(prompts.system, prompts.user, visionImages);
    const parsed = parseJsonResponse<
      { languageDirective: string; outlines: SceneOutline[] } | SceneOutline[]
    >(response);

    let languageDirective: string;
    let rawOutlines: SceneOutline[];

    if (Array.isArray(parsed)) {
      // Fallback: LLM returned old flat array format
      languageDirective = DEFAULT_LANGUAGE_DIRECTIVE;
      rawOutlines = parsed;
    } else if (parsed && parsed.outlines) {
      languageDirective = parsed.languageDirective || DEFAULT_LANGUAGE_DIRECTIVE;
      rawOutlines = parsed.outlines;
    } else {
      return { success: false, error: 'Failed to parse scene outlines response' };
    }

    if (!Array.isArray(rawOutlines)) {
      return { success: false, error: 'Failed to parse scene outlines response' };
    }

    // Ensure IDs and order; preserve suggestedLayoutId on slide outlines when present
    const enriched = rawOutlines.map((outline, index) => {
      const { suggestedLayoutId, visualHint, ...rest } = outline as SceneOutline & {
        suggestedLayoutId?: unknown;
        visualHint?: unknown;
      };
      const result: SceneOutline = {
        ...rest,
        id: outline.id || nanoid(),
        order: index + 1,
      };
      if (result.type === 'slide' && typeof suggestedLayoutId === 'string' && suggestedLayoutId) {
        result.suggestedLayoutId = suggestedLayoutId;
      }
      if (result.type === 'slide' && typeof visualHint === 'string' && visualHint.trim()) {
        result.visualHint = visualHint.trim();
      }
      if (result.type === 'slide' && htmlSlides) {
        result.slideOutputFormat = 'html';
      }
      return result;
    });

    const normalized = normalizeSlideOutlinesForGeneration(enriched);

    // Replace sequential gen_img_N/gen_vid_N with globally unique IDs
    const result = uniquifyMediaElementIds(normalized);

    callbacks?.onProgress?.({
      currentStage: 1,
      overallProgress: 50,
      stageProgress: 100,
      statusMessage: `已生成 ${result.length} 个场景大纲`,
      scenesGenerated: 0,
      totalScenes: result.length,
    });

    return { success: true, data: { languageDirective, outlines: result } };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Apply type fallbacks for outlines that can't be generated as their declared type.
 * - interactive without interactiveConfig OR widgetType+widgetOutline → slide
 * - pbl without pblConfig or languageModel → slide
 */
export function applyOutlineFallbacks(
  outline: SceneOutline,
  hasLanguageModel: boolean,
): SceneOutline {
  // Ultra Mode: interactive scenes with widgetType + widgetOutline are valid
  const hasWidgetConfig = outline.widgetType && outline.widgetOutline;

  if (outline.type === 'interactive' && !outline.interactiveConfig && !hasWidgetConfig) {
    log.warn(
      `Interactive outline "${outline.title}" missing interactiveConfig and widget config, falling back to slide`,
    );
    return { ...outline, type: 'slide' };
  }
  if (outline.type === 'pbl' && (!outline.pblConfig || !hasLanguageModel)) {
    log.warn(
      `PBL outline "${outline.title}" missing pblConfig or languageModel, falling back to slide`,
    );
    return { ...outline, type: 'slide' };
  }
  return outline;
}
