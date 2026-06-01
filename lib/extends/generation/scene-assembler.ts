/**
 * Pure data assembly for Scene objects — no server-only imports (fs, prompts, etc.).
 * Safe to import from client components.
 */

import { nanoid } from 'nanoid';
import type {
  SceneOutline,
  GeneratedSlideContent,
  GeneratedQuizContent,
  GeneratedInteractiveContent,
  GeneratedPBLContent,
} from '@/lib/types/generation';
import { assembleSlideSceneContent } from '@/lib/generation/pipeline-slide-canvas';
import { type PipelineSlideAssemblyOptions } from '@/lib/generation/pipeline-default-slide-theme';
import type { Scene } from '@/lib/types/stage';
import type { Action } from '@/lib/types/action';

type GeneratedContent =
  | GeneratedSlideContent
  | GeneratedQuizContent
  | GeneratedInteractiveContent
  | GeneratedPBLContent;

/**
 * Build complete Scene object from outline + generated content + actions.
 * Does NOT call any LLM or server API — pure data transformation.
 */
export type BuildCompleteSceneOptions = PipelineSlideAssemblyOptions;

export function buildCompleteScene(
  outline: SceneOutline,
  content: GeneratedContent,
  actions: Action[],
  stageId: string,
  options?: BuildCompleteSceneOptions,
): Scene | null {
  const sceneId = nanoid();

  if (outline.type === 'slide' && 'elements' in content) {
    return {
      id: sceneId,
      stageId,
      type: 'slide',
      title: outline.title,
      order: outline.order,
      content: assembleSlideSceneContent(outline, content, options),
      actions,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  if (outline.type === 'quiz' && 'questions' in content) {
    return {
      id: sceneId,
      stageId,
      type: 'quiz',
      title: outline.title,
      order: outline.order,
      content: {
        type: 'quiz',
        questions: content.questions,
      },
      actions,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  if (outline.type === 'interactive' && 'html' in content) {
    return {
      id: sceneId,
      stageId,
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
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  if (outline.type === 'pbl' && 'projectConfig' in content) {
    return {
      id: sceneId,
      stageId,
      type: 'pbl',
      title: outline.title,
      order: outline.order,
      content: {
        type: 'pbl',
        projectConfig: content.projectConfig,
      },
      actions,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  return null;
}
