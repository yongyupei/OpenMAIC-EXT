/**
 * @extends-from lib/hooks/use-scene-redesign.ts
 * @fork-branch feat/html-slide-design-workbench
 *
 * Background-capable scene redesign hook.
 *
 * Differences vs upstream:
 * - Multiple scenes can regenerate concurrently. State is keyed by sceneId.
 * - The dialog `redesignTarget` clears immediately when `startRedesign` is
 *   invoked, so the dialog never blocks other interactions — the work runs in
 *   the background and the result is committed when each scene finishes.
 * - Success and failure surface as `sonner` toasts so users get feedback
 *   without re-opening any modal.
 * - Per-scene helpers (`isSceneRedesigning`, `getSceneRedesignState`,
 *   `cancelSceneRedesign`) let consumers render inline indicators on each
 *   scene tile.
 *
 * Backward-compatible fields exposed for upstream consumers:
 * `isRedesigning`, `redesigningSceneId`, `redesignStep`, `error`, `cancelRedesign`.
 */
'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { useStageStore } from '@/lib/store/stage';
import { buildCompleteScene } from '@/lib/generation/scene-assembler';
import {
  buildSceneRedesignTraceHeaders,
  fetchSceneActions,
  fetchSceneContent,
  type SceneActionsRequestParams,
  type SceneContentRequestParams,
} from '@lib-extends/hooks/scene-fetch-helpers';
import {
  buildSceneGenerationRequestHeaders,
  getSceneGenerationModelReadinessError,
  withSceneGenerationThinkingConfig,
} from '@lib-extends/teacher/scene-generation-headers';
import type { ResolvedChapterModelContext } from '@lib-extends/teacher/resolve-chapter-model-config';
import { useI18n } from '@/lib/hooks/use-i18n';
import { generateClientTraceId } from '@lib-extends/observability/trace-ids';
import { useTraceDetailStore } from '@lib-extends/observability/trace-detail-store';
import type { Scene } from '@/lib/types/stage';
import type {
  SceneOutline,
  GeneratedSlideContent,
  GeneratedQuizContent,
  GeneratedInteractiveContent,
  GeneratedPBLContent,
} from '@/lib/types/generation';

type GeneratedContent =
  | GeneratedSlideContent
  | GeneratedQuizContent
  | GeneratedInteractiveContent
  | GeneratedPBLContent;

export interface ReferenceText {
  fileName: string;
  text: string;
}

export interface SceneRedesignState {
  /** Snapshot of the scene title at start so we can surface it in toasts. */
  readonly sceneTitle: string;
  readonly step: 'content' | 'actions' | null;
  readonly error: string | null;
  /** Propagated to scene-content/actions APIs for unified trace. */
  readonly traceId?: string;
}

function sceneToOutline(scene: Scene): SceneOutline {
  const base: SceneOutline = {
    id: scene.id,
    type: scene.type,
    title: scene.title,
    description: '',
    keyPoints: [],
    order: scene.order,
  };

  if (scene.type === 'quiz' && scene.content.type === 'quiz') {
    const questions = scene.content.questions;
    const typeMap: Record<string, 'single' | 'multiple' | 'text'> = {
      single: 'single',
      multiple: 'multiple',
      short_answer: 'text',
    };
    const questionTypes = [...new Set(questions.map((q) => typeMap[q.type]).filter(Boolean))];
    return {
      ...base,
      quizConfig: {
        questionCount: questions.length,
        difficulty: 'medium' as const,
        questionTypes: questionTypes.length > 0 ? questionTypes : ['single' as const],
      },
    };
  }

  if (scene.type === 'pbl' && scene.content.type === 'pbl') {
    const config = scene.content.projectConfig;
    return {
      ...base,
      pblConfig: {
        projectTopic: config.projectInfo?.title || scene.title,
        projectDescription: config.projectInfo?.description || '',
        targetSkills:
          config.agents?.map((a) => a.actor_role).filter((r): r is string => Boolean(r)) || [],
        issueCount: config.issueboard?.issues?.length || 3,
      },
    };
  }

  return base;
}

export interface UseSceneRedesignOptions {
  /** When set (teacher studio), use chapter/course generation profile instead of global settings. */
  readonly generationModelContext?: ResolvedChapterModelContext | null;
}

export function useSceneRedesign(options?: UseSceneRedesignOptions) {
  const generationModelContext = options?.generationModelContext ?? null;
  const { t } = useI18n();
  const updateScene = useStageStore.use.updateScene();
  const outlines = useStageStore.use.outlines();
  const stage = useStageStore.use.stage();

  const [redesignTarget, setRedesignTarget] = useState<Scene | null>(null);
  const [sceneStates, setSceneStates] = useState<Record<string, SceneRedesignState>>({});
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  const setSceneState = useCallback(
    (sceneId: string, updater: (prev: SceneRedesignState | undefined) => SceneRedesignState | undefined) => {
      setSceneStates((prev) => {
        const next = { ...prev };
        const updated = updater(prev[sceneId]);
        if (updated === undefined) {
          delete next[sceneId];
        } else {
          next[sceneId] = updated;
        }
        return next;
      });
    },
    [],
  );

  const startRedesign = useCallback(
    async (
      direction: string,
      referenceTexts?: ReferenceText[],
      referenceLinks?: string[],
    ) => {
      const target = redesignTarget;
      if (!target || !stage) return;

      const sceneId = target.id;
      const sceneTitle = target.title;

      // Close the dialog immediately so the user can keep working.
      setRedesignTarget(null);

      // If this scene already has a run in flight, cancel and replace it.
      abortControllersRef.current.get(sceneId)?.abort();
      const controller = new AbortController();
      abortControllersRef.current.set(sceneId, controller);
      const signal = controller.signal;

      const traceId = generateClientTraceId();
      const traceHeaders = buildSceneRedesignTraceHeaders(traceId, sceneId, sceneTitle);

      setSceneState(sceneId, () => ({ sceneTitle, step: 'content', error: null, traceId }));

      try {
        const readinessError = getSceneGenerationModelReadinessError(generationModelContext);
        if (readinessError) {
          throw new Error(readinessError);
        }

        const outline = sceneToOutline(target);
        const sourceOutline = outlines.find((o) => o.id === sceneId);

        const sourceKeyPoints =
          sourceOutline?.keyPoints && sourceOutline.keyPoints.length > 0
            ? sourceOutline.keyPoints
            : outline.keyPoints;
        const sourceTeachingObjective =
          sourceOutline?.teachingObjective || outline.teachingObjective;
        const sourceDescription = sourceOutline?.description?.trim();

        const existingSpeechTexts = (target.actions ?? [])
          .filter((a) => a.type === 'speech')
          .map((a) => (a.text ?? '').trim())
          .filter((s) => s.length > 0);

        const parts: string[] = [];
        if (sourceDescription) {
          parts.push(`[原始大纲描述]: ${sourceDescription}`);
        }
        if (sourceTeachingObjective) {
          parts.push(`[原始教学目标]: ${sourceTeachingObjective}`);
        }
        if (sourceKeyPoints && sourceKeyPoints.length > 0) {
          parts.push(`[原始核心要点]:\n${sourceKeyPoints.map((kp) => `- ${kp}`).join('\n')}`);
        }
        if (existingSpeechTexts.length > 0) {
          const numbered = existingSpeechTexts
            .map((text, idx) => {
              const truncated = text.length > 600 ? `${text.slice(0, 600)}…` : text;
              return `${idx + 1}. ${truncated}`;
            })
            .join('\n');
          parts.push(`[原始旁白]:\n${numbered}`);
        }
        if (direction) parts.push(`[重新设计方向]: ${direction}`);
        if (referenceTexts && referenceTexts.length > 0) {
          for (const rt of referenceTexts) {
            const truncated = rt.text.length > 12000 ? `${rt.text.slice(0, 12000)}…` : rt.text;
            parts.push(`[参考资料: ${rt.fileName}]\n${truncated}`);
          }
        }
        if (referenceLinks && referenceLinks.length > 0) {
          parts.push(`[参考链接]: ${referenceLinks.join(', ')}`);
        }
        const enhancedDescription = parts.join('\n\n');
        const enhancedOutline: SceneOutline = {
          ...outline,
          description: enhancedDescription,
          ...(sourceKeyPoints ? { keyPoints: sourceKeyPoints } : {}),
          ...(sourceTeachingObjective ? { teachingObjective: sourceTeachingObjective } : {}),
        };

        const effectiveOutlines = outlines.length > 0 ? outlines : [enhancedOutline];

        const contentParams: SceneContentRequestParams = {
          outline: enhancedOutline,
          allOutlines: effectiveOutlines,
          stageId: stage.id,
          stageInfo: {
            name: stage.name,
            description: stage.description,
            language: stage.languageDirective,
            style: stage.style,
          },
        };

        const requestHeaders = buildSceneGenerationRequestHeaders(generationModelContext);
        const contentBody = withSceneGenerationThinkingConfig(contentParams, generationModelContext);

        const contentResult = await fetchSceneContent(
          contentBody,
          signal,
          traceHeaders,
          generationModelContext ? requestHeaders : undefined,
        );

        if (!contentResult.success) {
          throw new Error(contentResult.error || 'Failed to generate scene content');
        }

        if (signal.aborted) return;
        setSceneState(sceneId, (prev) => ({
          sceneTitle: prev?.sceneTitle ?? sceneTitle,
          step: 'actions',
          error: null,
        }));

        const actionsParams: SceneActionsRequestParams = {
          outline: contentResult.effectiveOutline || enhancedOutline,
          allOutlines: effectiveOutlines,
          content: contentResult.content,
          stageId: stage.id,
        };

        const actionsBody = withSceneGenerationThinkingConfig(actionsParams, generationModelContext);

        const actionsResult = await fetchSceneActions(
          actionsBody,
          signal,
          traceHeaders,
          generationModelContext ? requestHeaders : undefined,
        );

        if (!actionsResult.success || !actionsResult.scene) {
          throw new Error(actionsResult.error || 'Failed to generate scene actions');
        }

        const newScene = buildCompleteScene(
          enhancedOutline,
          contentResult.content as GeneratedContent,
          actionsResult.scene.actions || [],
          stage.id,
        );

        if (!newScene) {
          throw new Error('Failed to build complete scene');
        }

        if (signal.aborted) return;

        updateScene(sceneId, {
          content: newScene.content,
          actions: newScene.actions,
          title: newScene.title,
          updatedAt: Date.now(),
        });

        setSceneState(sceneId, () => undefined);
        toast.success(t('courseEditor.redesignBackgroundSuccess', { title: sceneTitle }));
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        const message = err instanceof Error ? err.message : 'Generation failed';
        setSceneState(sceneId, (prev) => ({
          sceneTitle: prev?.sceneTitle ?? sceneTitle,
          step: null,
          error: message,
          traceId: prev?.traceId ?? traceId,
        }));
        toast.error(t('courseEditor.redesignBackgroundError', { title: sceneTitle, message }), {
          action: {
            label: t('observability.diagnoseButton'),
            onClick: () => useTraceDetailStore.getState().openTrace(traceId, 'toast'),
          },
        });
      } finally {
        abortControllersRef.current.delete(sceneId);
      }
    },
    [redesignTarget, stage, outlines, updateScene, setSceneState, t, generationModelContext],
  );

  const cancelSceneRedesign = useCallback(
    (sceneId: string) => {
      const controller = abortControllersRef.current.get(sceneId);
      if (controller) {
        controller.abort();
        abortControllersRef.current.delete(sceneId);
      }
      setSceneState(sceneId, () => undefined);
    },
    [setSceneState],
  );

  const cancelRedesign = useCallback(() => {
    const target = redesignTarget;
    if (target) {
      cancelSceneRedesign(target.id);
      return;
    }
    const firstSceneId = Object.keys(sceneStates)[0];
    if (firstSceneId) cancelSceneRedesign(firstSceneId);
  }, [redesignTarget, sceneStates, cancelSceneRedesign]);

  const clearSceneRedesignError = useCallback(
    (sceneId: string) => {
      setSceneState(sceneId, (prev) => (prev?.error ? undefined : prev));
    },
    [setSceneState],
  );

  const isSceneRedesigning = useCallback(
    (sceneId: string): boolean => {
      const state = sceneStates[sceneId];
      return state !== undefined && state.error === null;
    },
    [sceneStates],
  );

  const getSceneRedesignState = useCallback(
    (sceneId: string): SceneRedesignState | undefined => sceneStates[sceneId],
    [sceneStates],
  );

  const redesigningSceneIds = useMemo(
    () =>
      Object.entries(sceneStates)
        .filter(([, state]) => state.error === null)
        .map(([id]) => id),
    [sceneStates],
  );

  const currentTargetState = redesignTarget ? sceneStates[redesignTarget.id] : undefined;
  const isRedesigning = currentTargetState !== undefined && currentTargetState.error === null;
  const redesignStep = currentTargetState?.step ?? null;
  const error = currentTargetState?.error ?? null;
  const redesigningSceneId = redesigningSceneIds[0] ?? null;

  return {
    redesignTarget,
    setRedesignTarget,
    isRedesigning,
    redesigningSceneId,
    redesigningSceneIds,
    redesignStep,
    error,
    isSceneRedesigning,
    getSceneRedesignState,
    cancelSceneRedesign,
    clearSceneRedesignError,
    startRedesign,
    cancelRedesign,
  };
}
