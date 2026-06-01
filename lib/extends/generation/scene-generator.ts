/**
 * Stage 2: Scene content and action generation.
 *
 * Generates full scenes (slide/quiz/interactive/pbl with actions)
 * from scene outlines.
 */

import { createStageAPI } from '@/lib/api/stage-api';
import { generateHtmlSlideContent } from '@/lib/generation/html-slide-generator';
import { assembleSlideSceneContent } from '@/lib/generation/pipeline-slide-canvas';
import type { PipelineSlideAssemblyOptions } from '@/lib/generation/pipeline-default-slide-theme';
import type {
  GeneratedInteractiveContent,
  GeneratedPBLContent,
  GeneratedQuizContent,
  GeneratedSlideContent,
  SceneOutline,
} from '@/lib/types/generation';
import type { Action } from '@/lib/types/action';
import type {
  AICallFn,
  GenerationCallbacks,
  GenerationResult,
} from '@/lib/generation/pipeline-types';
import type { StageStore } from '@/lib/api/stage-api';
import { createLogger } from '@/lib/logger';

import { generateSceneActions, type SceneActionsOptions } from './scene-generator-actions';
import { generatePBLSceneContent } from './scene-generator-pbl-content';
import { generateQuizContent } from './scene-generator-quiz-content';
import { generateSlideContent } from './scene-generator-slide-content';
import { type SceneContentOptions } from './scene-generator-types';
import {
  generateWidgetContent,
  prepareInteractiveOutline,
} from './scene-generator-widget-content';

export type { SceneActionsOptions, SceneContentOptions };
export { generateSceneActions };

const log = createLogger('Generation');

export async function generateFullScenes(
  sceneOutlines: SceneOutline[],
  store: StageStore,
  aiCall: AICallFn,
  callbacks?: GenerationCallbacks,
  languageDirective?: string,
): Promise<GenerationResult<string[]>> {
  const api = createStageAPI(store);
  const totalScenes = sceneOutlines.length;
  let completedCount = 0;

  callbacks?.onProgress?.({
    currentStage: 3,
    overallProgress: 66,
    stageProgress: 0,
    statusMessage: `正在并行生成 ${totalScenes} 个场景...`,
    scenesGenerated: 0,
    totalScenes,
  });

  const results = await Promise.all(
    sceneOutlines.map(async (outline, index) => {
      try {
        const sceneId = await generateSingleScene(outline, api, aiCall, languageDirective);

        completedCount++;
        callbacks?.onProgress?.({
          currentStage: 3,
          overallProgress: 66 + Math.floor((completedCount / totalScenes) * 34),
          stageProgress: Math.floor((completedCount / totalScenes) * 100),
          statusMessage: `已完成 ${completedCount}/${totalScenes} 个场景`,
          scenesGenerated: completedCount,
          totalScenes,
        });

        return { success: true, sceneId, index };
      } catch (error) {
        completedCount++;
        callbacks?.onError?.(`Failed to generate scene ${outline.title}: ${error}`);
        return { success: false, sceneId: null, index };
      }
    }),
  );

  const sceneIds = results
    .filter(
      (r): r is { success: true; sceneId: string; index: number } =>
        r.success && r.sceneId !== null,
    )
    .sort((a, b) => a.index - b.index)
    .map((r) => r.sceneId);

  return { success: true, data: sceneIds };
}

async function generateSingleScene(
  outline: SceneOutline,
  api: ReturnType<typeof createStageAPI>,
  aiCall: AICallFn,
  languageDirective?: string,
): Promise<string | null> {
  log.info(`Step 3.1: Generating content for: ${outline.title}`);
  const content = await generateSceneContent(outline, aiCall, { languageDirective });
  if (!content) {
    log.error(`Failed to generate content for: ${outline.title}`);
    return null;
  }

  log.info(`Step 3.2: Generating actions for: ${outline.title}`);
  const actions = await generateSceneActions(outline, content, aiCall, { languageDirective });
  log.info(`Generated ${actions.length} actions for: ${outline.title}`);

  return createSceneWithActions(outline, content, actions, api);
}

export async function generateSceneContent(
  outline: SceneOutline,
  aiCall: AICallFn,
  options: SceneContentOptions = {},
): Promise<
  | GeneratedSlideContent
  | GeneratedQuizContent
  | GeneratedInteractiveContent
  | GeneratedPBLContent
  | null
> {
  const {
    assignedImages,
    imageMapping,
    languageModel,
    visionEnabled,
    generatedMediaMapping,
    agents,
    languageDirective,
    thinkingConfig,
    chapterDesignBrief,
    chapterSlideVisualBrief,
    researchContext,
    resolvedTemplate,
    slideOutputFormat,
    slideAiCall,
    onSlideGenerationTick,
  } = options;

  if (outline.type === 'interactive') {
    return generateWidgetContent(
      prepareInteractiveOutline(outline),
      aiCall,
      languageDirective,
      chapterDesignBrief,
      researchContext,
    );
  }

  switch (outline.type) {
    case 'slide':
      if (options.slideOutputFormat === 'html') {
        return generateHtmlSlideContent(outline, aiCall, options);
      }
      return generateSlideContent(outline, aiCall, {
        assignedImages,
        imageMapping,
        visionEnabled,
        generatedMediaMapping,
        agents,
        languageDirective,
        chapterDesignBrief,
        chapterSlideVisualBrief,
        researchContext,
        resolvedTemplate,
        slideAiCall,
        onSlideGenerationTick,
      });
    case 'quiz':
      return generateQuizContent(
        outline,
        aiCall,
        languageDirective,
        chapterDesignBrief,
        researchContext,
      );
    case 'pbl':
      return generatePBLSceneContent(outline, languageModel, languageDirective, thinkingConfig);
    default:
      log.warn(`Unknown scene type "${outline.type}" for ${outline.id}, generating as slide`);
      return generateSlideContent(
        { ...outline, type: 'slide' },
        aiCall,
        {
          assignedImages,
          imageMapping,
          visionEnabled,
          generatedMediaMapping,
          agents,
          languageDirective,
          chapterDesignBrief,
          chapterSlideVisualBrief,
          researchContext,
          resolvedTemplate,
          slideAiCall,
          onSlideGenerationTick,
        },
      );
  }
}

export function createSceneWithActions(
  outline: SceneOutline,
  content:
    | GeneratedSlideContent
    | GeneratedQuizContent
    | GeneratedInteractiveContent
    | GeneratedPBLContent,
  actions: Action[],
  api: ReturnType<typeof createStageAPI>,
  assemblyOptions?: PipelineSlideAssemblyOptions,
): string | null {
  if (outline.type === 'slide' && 'elements' in content) {
    const sceneResult = api.scene.create({
      type: 'slide',
      title: outline.title,
      order: outline.order,
      content: assembleSlideSceneContent(outline, content, assemblyOptions),
      actions,
    });

    return sceneResult.success ? (sceneResult.data ?? null) : null;
  }

  if (outline.type === 'quiz' && 'questions' in content) {
    const sceneResult = api.scene.create({
      type: 'quiz',
      title: outline.title,
      order: outline.order,
      content: {
        type: 'quiz',
        questions: content.questions,
      },
      actions,
    });

    return sceneResult.success ? (sceneResult.data ?? null) : null;
  }

  if (outline.type === 'interactive' && 'html' in content) {
    const sceneResult = api.scene.create({
      type: 'interactive',
      title: outline.title,
      order: outline.order,
      content: {
        type: 'interactive',
        url: '',
        html: content.html,
        widgetType: content.widgetType,
        widgetConfig: content.widgetConfig,
        teacherActions: content.teacherActions,
      },
      actions,
    });

    return sceneResult.success ? (sceneResult.data ?? null) : null;
  }

  if (outline.type === 'pbl' && 'projectConfig' in content) {
    const sceneResult = api.scene.create({
      type: 'pbl',
      title: outline.title,
      order: outline.order,
      content: {
        type: 'pbl',
        projectConfig: content.projectConfig,
      },
      actions,
    });

    return sceneResult.success ? (sceneResult.data ?? null) : null;
  }

  return null;
}
