import { nanoid } from 'nanoid';

import { MAX_VISION_IMAGES } from '@/lib/constants/generation';
import { buildPrompt, PROMPT_IDS } from '@/lib/prompts';
import { parseJsonResponse } from '@/lib/generation/json-repair';
import {
  formatImageDescription,
  formatImagePlaceholder,
  formatTeacherPersonaForPrompt,
} from '@/lib/generation/prompt-formatters';
import type {
  GeneratedSlideContent,
  ImageMapping,
  PdfImage,
  SceneOutline,
} from '@/lib/types/generation';
import type { PPTElement, SlideBackground } from '@/lib/types/slides';
import type { GeneratedSlideData, AICallFn } from '@/lib/generation/pipeline-types';
import { buildDefaultTemplatePromptVariables } from '@/lib/slide-templates/generation-design-guide';
import { createLogger } from '@/lib/logger';

import { CONTENT_GENERATION_MAX_ATTEMPTS } from './scene-generator-constants';
import { normalizeSlideOutlineForGeneration } from './outline-normalizer';
import { buildSlideContentFallback } from './scene-generator-fallbacks';
import {
  fixElementDefaults,
  normalizeGeneratedVideoRefs,
  processLatexElements,
  resolveImageIds,
} from './scene-generator-media-utils';
import type { SceneContentOptions } from './scene-generator-types';

const log = createLogger('Generation');

function materializeSlideFromParsedData(
  outline: SceneOutline,
  generatedData: GeneratedSlideData,
  assignedImages?: PdfImage[],
  imageMapping?: ImageMapping,
  generatedMediaMapping?: ImageMapping,
): GeneratedSlideContent | null {
  if (!generatedData.elements || !Array.isArray(generatedData.elements)) {
    return null;
  }
  if (generatedData.elements.length === 0) {
    return null;
  }

  const fixedElements = fixElementDefaults(generatedData.elements, assignedImages);
  const latexProcessedElements = processLatexElements(fixedElements);
  const resolvedElements = resolveImageIds(
    latexProcessedElements,
    imageMapping,
    generatedMediaMapping,
  );
  const videoNormalizedElements = normalizeGeneratedVideoRefs(
    resolvedElements,
    outline.mediaGenerations,
  );
  const processedElements: PPTElement[] = videoNormalizedElements.map((el) => ({
    ...el,
    id: `${el.type}_${nanoid(8)}`,
    rotate: 0,
  })) as PPTElement[];

  if (processedElements.length === 0) {
    return null;
  }

  let background: SlideBackground | undefined;
  if (generatedData.background) {
    if (generatedData.background.type === 'solid' && generatedData.background.color) {
      background = { type: 'solid', color: generatedData.background.color };
    } else if (generatedData.background.type === 'gradient' && generatedData.background.gradient) {
      background = {
        type: 'gradient',
        gradient: generatedData.background.gradient,
      };
    }
  }

  return {
    elements: processedElements,
    background,
    remark: generatedData.remark || outline.description,
  };
}

export async function generateSlideContent(
  outline: SceneOutline,
  aiCall: AICallFn,
  options: SceneContentOptions = {},
): Promise<GeneratedSlideContent> {
  const slideOutline = normalizeSlideOutlineForGeneration(outline);

  const {
    assignedImages,
    imageMapping,
    visionEnabled,
    generatedMediaMapping,
    agents,
    languageDirective,
    chapterDesignBrief,
    chapterSlideVisualBrief,
    slideAiCall,
    onSlideGenerationTick,
  } = options;

  const slideLlmCall = options.slideAiCall ?? aiCall;
  const onSlideTick = options.onSlideGenerationTick;
  let assignedImagesText = '无可用图片，禁止插入任何 image 元素';
  let visionImages: Array<{ id: string; src: string }> | undefined;

  if (assignedImages && assignedImages.length > 0) {
    if (visionEnabled && imageMapping) {
      const withSrc = assignedImages.filter((img) => imageMapping[img.id]);
      const visionSlice = withSrc.slice(0, MAX_VISION_IMAGES);
      const textOnlySlice = withSrc.slice(MAX_VISION_IMAGES);
      const noSrcImages = assignedImages.filter((img) => !imageMapping[img.id]);

      const visionDescriptions = visionSlice.map((img) => formatImagePlaceholder(img));
      const textDescriptions = [...textOnlySlice, ...noSrcImages].map((img) =>
        formatImageDescription(img),
      );
      assignedImagesText = [...visionDescriptions, ...textDescriptions].join('\n');

      visionImages = visionSlice.map((img) => ({
        id: img.id,
        src: imageMapping[img.id],
        width: img.width,
        height: img.height,
      }));
    } else {
      assignedImagesText = assignedImages.map((img) => formatImageDescription(img)).join('\n');
    }
  }

  const generatedImageEntries = outline.mediaGenerations?.filter((mg) => mg.type === 'image') ?? [];
  const generatedVideoEntries = outline.mediaGenerations?.filter((mg) => mg.type === 'video') ?? [];
  const hasAssignedImages = (assignedImages?.length ?? 0) > 0;
  const generatedImageEnabled = generatedImageEntries.length > 0;
  const generatedVideoEnabled = generatedVideoEntries.length > 0;
  const imageElementEnabled = hasAssignedImages || generatedImageEnabled;
  const mediaElementEnabled = imageElementEnabled || generatedVideoEnabled;

  if (outline.mediaGenerations && outline.mediaGenerations.length > 0) {
    const genImgDescs = generatedImageEntries
      .map((mg) => `- ${mg.elementId}: "${mg.prompt}" (aspect ratio: ${mg.aspectRatio || '16:9'})`)
      .join('\n');
    const genVidDescs = generatedVideoEntries
      .map((mg) => `- ${mg.elementId}: "${mg.prompt}" (aspect ratio: ${mg.aspectRatio || '16:9'})`)
      .join('\n');

    const mediaParts: string[] = [];
    if (genImgDescs) {
      mediaParts.push(`AI-Generated Images (use these IDs as image element src):\n${genImgDescs}`);
    }
    if (genVidDescs) {
      mediaParts.push(
        `AI-Generated Videos (use these IDs as video element mediaRef):\n${genVidDescs}`,
      );
    }

    if (mediaParts.length > 0) {
      const mediaText = mediaParts.join('\n\n');
      if (assignedImagesText.includes('禁止插入') || assignedImagesText.includes('No images')) {
        assignedImagesText = mediaText;
      } else {
        assignedImagesText += `\n\n${mediaText}`;
      }
    }
  }

  const canvasWidth = 1000;
  const canvasHeight = 562.5;
  const teacherContext = formatTeacherPersonaForPrompt(agents);

  const prompts = buildPrompt(PROMPT_IDS.SLIDE_CONTENT, {
    title: slideOutline.title,
    description: slideOutline.description,
    keyPoints: (slideOutline.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join('\n'),
    visualHint: slideOutline.visualHint?.trim() ?? '',
    elements: '（根据要点自动生成）',
    assignedImages: assignedImagesText,
    canvas_width: canvasWidth,
    canvas_height: canvasHeight,
    teacherContext,
    chapterSlideVisualBrief: chapterSlideVisualBrief || chapterDesignBrief || '',
    languageDirective: languageDirective || '',
    imageElementEnabled,
    generatedImageEnabled,
    generatedVideoEnabled,
    mediaElementEnabled,
    ...buildDefaultTemplatePromptVariables(),
  });

  if (!prompts) {
    log.error(`Failed to build slide prompt for: ${outline.title}`);
    return buildSlideContentFallback(outline);
  }

  log.debug(`Generating slide content for: ${outline.title}`);

  for (let attempt = 1; attempt <= CONTENT_GENERATION_MAX_ATTEMPTS; attempt++) {
    try {
      await onSlideTick?.();
      const response = await slideLlmCall(prompts.system, prompts.user, visionImages);
      const generatedData = parseJsonResponse<GeneratedSlideData>(response);
      if (!generatedData) {
        log.warn(
          `Failed to parse slide JSON for "${outline.title}" (attempt ${attempt}/${CONTENT_GENERATION_MAX_ATTEMPTS})`,
        );
        continue;
      }

      log.debug(`Got ${generatedData.elements?.length ?? 0} elements for: ${outline.title}`);

      const materialized = materializeSlideFromParsedData(
        slideOutline,
        generatedData,
        assignedImages,
        imageMapping,
        generatedMediaMapping,
      );
      if (materialized) {
        return materialized;
      }
      log.warn(
        `Slide content empty after processing for "${outline.title}" (attempt ${attempt}/${CONTENT_GENERATION_MAX_ATTEMPTS})`,
      );
    } catch (error) {
      log.warn(
        `Slide AI call failed for "${outline.title}" (attempt ${attempt}/${CONTENT_GENERATION_MAX_ATTEMPTS}):`,
        error,
      );
    }
  }

  log.warn(`Using slide content fallback for: ${slideOutline.title}`);
  return buildSlideContentFallback(slideOutline);
}
