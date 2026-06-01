/**
 * @extends-from lib/generation/workflow/execute-chapter-workflow.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { callLLM } from '@/lib/ai/llm';
import { resolveSlideContentMaxOutputTokens } from '../scene-generator-constants';
import type { AICallFn } from '@/lib/generation/pipeline-types';
import {
  buildCompleteScene,
  generateSceneActions,
  generateSceneContent,
  type SceneGenerationContext,
} from '@/lib/generation/generation-pipeline';
import {
  applyOutlineFallbacks,
  generateSceneOutlinesFromRequirements,
} from '@/lib/generation/outline-generator';
import { buildLanguageText } from '@/lib/generation/prompt-formatters';
import { uniquifyMediaElementIds } from '@/lib/generation/scene-builder';
import {
  buildWorkflowExecutionPlan,
  type WorkflowExecutionStep,
} from '@/lib/generation/workflow';
import type { WorkflowStepType } from '@/lib/generation/workflow/workflow-schema';
import { getDefaultAgents } from '@/lib/orchestration/registry/store';
import { createLogger } from '@/lib/logger';
import {
  buildRequestOrigin,
  persistClassroom,
  readClassroom,
} from '@/lib/server/classroom-storage';
import {
  generateMediaForClassroom,
  replaceMediaPlaceholders,
} from '@/lib/server/classroom-media-generation';
import { generateChapterClassroomTts } from '@/lib/extends/server/chapter-tts-generation';
import { resolveGenerationTtsConfig } from '@/lib/extends/teacher/resolve-generation-tts-config';
import type { ModelInfo, ThinkingConfig } from '@/lib/types/provider';
import { applyChapterClassroomUpdate } from '@/lib/teacher/course-project';
import { readTeacherProject, writeTeacherProject } from '@/lib/teacher/course-project-storage';
import { buildChapterSceneDeepSearchContext } from '@/lib/teacher/chapter-generation-enrichment';
import {
  buildChapterSceneGenerationContext,
  prepareChapterGenerationInput,
} from '@/lib/teacher/chapter-generation-input';
import {
  chapterForFullRegenerate,
  getSceneGenerationStartIndex,
  shouldResumeChapterGeneration,
} from '@/lib/teacher/chapter-generation-resume';
import { resolveGenerationProfile } from '@/lib/teacher/resolve-generation-profile';
import type {
  CourseChapter,
  CourseChapterClassroom,
  CourseChapterClassroomFailedStep,
  CourseProject,
} from '@/lib/teacher/course-types';
import type { Action } from '@/lib/types/action';
import type { NextRequest } from 'next/server';
import type { LanguageModel } from 'ai';
import type { Scene, Stage } from '@/lib/types/stage';

const log = createLogger('ExecuteChapterWorkflow');

export type ChapterWorkflowOutcome =
  | { kind: 'ready'; classroomId: string; sceneCount: number; missingTemplateIds: string[] }
  | { kind: 'awaiting-outline-approval'; classroomId: string; sceneOutlineCount: number };

export interface ExecuteChapterWorkflowParams {
  readonly request: NextRequest;
  readonly projectId: string;
  readonly chapterId: string;
  readonly project: CourseProject;
  readonly chapter: CourseChapter;
  readonly classroomId: string;
  readonly previousChapterClassroom?: CourseChapterClassroom;
  readonly resume: boolean;
  readonly regenerate: boolean;
  readonly approveOutline: boolean;
  readonly languageModel: LanguageModel;
  readonly modelInfo?: ModelInfo;
  readonly thinkingConfig?: ThinkingConfig;
}

function collectSpeechTexts(actions: Action[]): string[] {
  return actions
    .filter((action) => action.type === 'speech')
    .map((action) => action.text)
    .filter((text) => text.length > 0);
}

function buildStageForChapter(classroomId: string, chapter: CourseChapter): Stage {
  const now = Date.now();
  return {
    id: classroomId,
    name: chapter.title,
    createdAt: now,
    updatedAt: now,
  };
}

function isStepInPlan(plan: WorkflowExecutionStep[], type: WorkflowStepType): boolean {
  return plan.some((step) => step.type === type);
}

function outlineStepRequiresApproval(plan: WorkflowExecutionStep[]): boolean {
  const outline = plan.find((step) => step.type === 'outline');
  return outline?.requiresApproval === true;
}

async function writeChapterGenerationProgress(
  projectId: string,
  chapterId: string,
  classroomId: string,
  previousChapterClassroom: CourseChapterClassroom | undefined,
  now: string,
  update: {
    status: CourseChapterClassroom['status'];
    generationStep?: CourseChapterClassroom['generationStep'];
    sceneCount?: number;
  },
): Promise<void> {
  try {
    const freshProject = await readTeacherProject(projectId);
    if (!freshProject) return;
    await writeTeacherProject(
      applyChapterClassroomUpdate(freshProject, {
        chapterId,
        classroomId,
        createdAt: previousChapterClassroom?.createdAt ?? now,
        updatedAt: new Date().toISOString(),
        ...update,
      }),
    );
  } catch (progressErr) {
    log.warn('Failed to write chapter generation progress, continuing:', progressErr);
  }
}

export async function executeChapterGenerationWorkflow(
  params: ExecuteChapterWorkflowParams,
): Promise<ChapterWorkflowOutcome> {
  const {
    request,
    projectId,
    chapterId,
    project,
    chapter,
    classroomId,
    previousChapterClassroom,
    resume,
    regenerate,
    approveOutline,
    languageModel,
    modelInfo,
    thinkingConfig,
  } = params;

  const resolved = resolveGenerationProfile(project, chapter);
  const executionPlan = buildWorkflowExecutionPlan(resolved.workflow);
  const runOutline = isStepInPlan(executionPlan, 'outline');
  const runScenes =
    isStepInPlan(executionPlan, 'scene-content') ||
    isStepInPlan(executionPlan, 'scene-actions');
  const runMedia = isStepInPlan(executionPlan, 'media');
  const runTts = isStepInPlan(executionPlan, 'tts');
  // Full-regenerate always pauses for human outline review so the workflow
  // mirrors the homepage student flow (outline preview → confirm → scenes),
  // regardless of the project's selected workflow preset. The approve-continue
  // POST sends `approveOutline=true` and must bypass the pause.
  const pauseForOutlineApproval =
    !approveOutline && (regenerate || outlineStepRequiresApproval(executionPlan));

  const baseUrl = buildRequestOrigin(request);
  const now = new Date().toISOString();

  const aiCall = async (systemPrompt: string, userPrompt: string): Promise<string> => {
    const result = await callLLM(
      {
        model: languageModel,
        system: systemPrompt,
        prompt: userPrompt,
        maxOutputTokens: modelInfo?.outputWindow,
      },
      'teacher-chapter-classroom',
      undefined,
      thinkingConfig,
    );
    return result.text;
  };

  const slideAiCall: AICallFn = async (systemPrompt, userPrompt) => {
    const result = await callLLM(
      {
        model: languageModel,
        system: systemPrompt,
        prompt: userPrompt,
        maxOutputTokens: resolveSlideContentMaxOutputTokens(modelInfo?.outputWindow),
      },
      'teacher-chapter-slide-content',
      undefined,
      thinkingConfig,
    );
    return result.text;
  };

  const resumeMode = shouldResumeChapterGeneration(previousChapterClassroom, {
    resume,
    regenerate,
    approveOutline,
  });

  let existingScenes: Scene[] = [];
  if (resumeMode && !regenerate) {
    const persisted = await readClassroom(classroomId);
    if (persisted?.scenes?.length) {
      existingScenes = persisted.scenes;
    }
  }

  let workingChapter = chapterForFullRegenerate(chapter, regenerate);
  if (regenerate) {
    const freshProject = await readTeacherProject(projectId);
    if (freshProject?.outline) {
      await writeTeacherProject({
        ...freshProject,
        outline: {
          ...freshProject.outline,
          chapters: freshProject.outline.chapters.map((c) =>
            c.id === chapterId ? workingChapter : c,
          ),
        },
        updatedAt: new Date().toISOString(),
      });
    }
    const emptyStage = buildStageForChapter(classroomId, workingChapter);
    await persistClassroom({ id: classroomId, stage: emptyStage, scenes: [] }, baseUrl);
  }

  const chapterInput = await prepareChapterGenerationInput(project, workingChapter, aiCall);

  if (
    runOutline &&
    (!workingChapter.sceneOutlines || workingChapter.sceneOutlines.length === 0)
  ) {
    await writeChapterGenerationProgress(
      projectId,
      chapterId,
      classroomId,
      previousChapterClassroom,
      now,
      { status: 'generating', generationStep: 'outline' },
    );

    const outlineResult = await generateSceneOutlinesFromRequirements(
      chapterInput.requirements,
      chapterInput.referenceText,
      undefined,
      aiCall,
      undefined,
        {
          teacherContext: chapterInput.teacherContext,
          researchContext: chapterInput.researchContext,
          generationMode: chapterInput.generationMode,
          slideOutputFormat: chapterInput.slideOutputFormat,
          promptOverrides: resolved.promptOverrides,
        },
      );
    if (!outlineResult.success || !outlineResult.data) {
      throw new Error('Failed to generate chapter outline');
    }
    const sceneOutlines = outlineResult.data.outlines.map((o, i) => ({ ...o, order: i }));
    workingChapter = { ...workingChapter, sceneOutlines };

    const freshProject = await readTeacherProject(projectId);
    if (freshProject?.outline) {
      await writeTeacherProject({
        ...freshProject,
        outline: {
          ...freshProject.outline,
          languageDirective:
            outlineResult.data.languageDirective ?? freshProject.outline.languageDirective,
          chapters: freshProject.outline.chapters.map((c) =>
            c.id === chapterId ? workingChapter : c,
          ),
        },
        updatedAt: new Date().toISOString(),
      });
    }

    if (pauseForOutlineApproval && !approveOutline) {
      const latest = await readTeacherProject(projectId);
      if (latest) {
        await writeTeacherProject(
          applyChapterClassroomUpdate(latest, {
            chapterId,
            classroomId,
            status: 'awaiting-outline-approval',
            createdAt: previousChapterClassroom?.createdAt ?? now,
            updatedAt: now,
          }),
        );
      }
      return {
        kind: 'awaiting-outline-approval',
        classroomId,
        sceneOutlineCount: workingChapter.sceneOutlines?.length ?? 0,
      };
    }
  }

  if (!runScenes) {
    const stage = buildStageForChapter(classroomId, workingChapter);
    await persistClassroom({ id: classroomId, stage, scenes: [] }, baseUrl);
    return {
      kind: 'ready',
      classroomId,
      sceneCount: 0,
      missingTemplateIds: chapterInput.missingTemplateIds,
    };
  }

  const agents = getDefaultAgents();
  const languageDirective = buildLanguageText(project.outline?.languageDirective);
  const chapterOutlines = uniquifyMediaElementIds(workingChapter.sceneOutlines ?? []);
  if (chapterOutlines.length === 0) {
    throw new Error('Chapter has no scene outlines');
  }
  const allTitles = chapterOutlines.map((o) => o.title);
  const totalPages = chapterOutlines.length;
  const startIndex = getSceneGenerationStartIndex(existingScenes, regenerate);
  const scenes: Scene[] = regenerate ? [] : [...existingScenes];

  let previousSpeeches: string[] = [];
  if (startIndex > 0) {
    const lastScene = scenes[startIndex - 1];
    if (lastScene) {
      previousSpeeches = collectSpeechTexts(lastScene.actions ?? []);
    }
  }

  const sceneResearchContext = await buildChapterSceneDeepSearchContext(
    project,
    workingChapter,
    chapterInput.referenceText,
    aiCall,
  );
  const sceneContext = buildChapterSceneGenerationContext(
    project,
    workingChapter,
    chapterInput.referenceText,
    sceneResearchContext,
    chapterInput.generationMode,
  );

  const stage = buildStageForChapter(classroomId, workingChapter);

  for (let index = startIndex; index < chapterOutlines.length; index++) {
    const outline = chapterOutlines[index]!;
    const safeOutline = applyOutlineFallbacks(outline, true);

    await writeChapterGenerationProgress(
      projectId,
      chapterId,
      classroomId,
      previousChapterClassroom,
      now,
      { status: 'generating', generationStep: 'scene-content', sceneCount: scenes.length },
    );

    const content = await generateSceneContent(safeOutline, aiCall, {
      agents,
      languageDirective,
      thinkingConfig,
      chapterDesignBrief: sceneContext.designBrief,
      chapterSlideVisualBrief: sceneContext.slideVisualBrief,
      resolvedTemplate: chapterInput.resolvedTemplate,
      slideOutputFormat: chapterInput.slideOutputFormat,
      slideAiCall,
      onSlideGenerationTick: () =>
        writeChapterGenerationProgress(
          projectId,
          chapterId,
          classroomId,
          previousChapterClassroom,
          now,
          { status: 'generating', generationStep: 'scene-content', sceneCount: scenes.length },
        ),
      ...(safeOutline.type === 'pbl' ? { languageModel } : {}),
    });
    if (!content) throw new Error(`Failed to generate content for scene: ${outline.id}`);

    const ctx: SceneGenerationContext = {
      pageIndex: index + 1,
      totalPages,
      allTitles,
      previousSpeeches,
    };

    await writeChapterGenerationProgress(
      projectId,
      chapterId,
      classroomId,
      previousChapterClassroom,
      now,
      { status: 'generating', generationStep: 'scene-actions', sceneCount: scenes.length },
    );

    const actions = await generateSceneActions(safeOutline, content, aiCall, {
      ctx,
      agents,
      languageDirective,
      chapterDesignBrief: sceneContext.designBrief,
      researchContext: sceneContext.researchContext,
    });
    previousSpeeches = collectSpeechTexts(actions);

    const scene = buildCompleteScene(safeOutline, content, actions, classroomId, {
      resolvedTemplate: chapterInput.resolvedTemplate,
    });
    if (!scene) throw new Error(`Failed to build scene: ${outline.id}`);
    scenes.push(scene);

    await persistClassroom({ id: classroomId, stage, scenes }, baseUrl);

    await writeChapterGenerationProgress(
      projectId,
      chapterId,
      classroomId,
      previousChapterClassroom,
      now,
      { status: 'generating', generationStep: 'scene-content', sceneCount: scenes.length },
    );
  }

  if (runMedia) {
    await writeChapterGenerationProgress(
      projectId,
      chapterId,
      classroomId,
      previousChapterClassroom,
      now,
      { status: 'generating', generationStep: 'media', sceneCount: scenes.length },
    );

    try {
      const mediaMap = await generateMediaForClassroom(chapterOutlines, classroomId, baseUrl);
      if (Object.keys(mediaMap).length > 0) replaceMediaPlaceholders(scenes, mediaMap);
    } catch (mediaErr) {
      log.warn('Chapter classroom media generation failed, continuing:', mediaErr);
    }
  }

  if (runTts) {
    await writeChapterGenerationProgress(
      projectId,
      chapterId,
      classroomId,
      previousChapterClassroom,
      now,
      { status: 'generating', generationStep: 'tts', sceneCount: scenes.length },
    );

    try {
      const ttsConfig = resolveGenerationTtsConfig({
        generationProfile: project.generationProfile,
        generationProfileOverride: workingChapter.generationProfileOverride,
      });
      if (ttsConfig) {
        await generateChapterClassroomTts(scenes, classroomId, baseUrl, ttsConfig);
      } else {
        log.warn('No server TTS provider configured for chapter generation; skipping TTS step');
      }
    } catch (ttsErr) {
      log.warn('Chapter classroom TTS generation failed, continuing:', ttsErr);
    }
  }

  await writeChapterGenerationProgress(
    projectId,
    chapterId,
    classroomId,
    previousChapterClassroom,
    now,
    { status: 'generating', generationStep: 'persist', sceneCount: scenes.length },
  );

  await persistClassroom(
    {
      id: classroomId,
      stage: buildStageForChapter(classroomId, workingChapter),
      scenes,
    },
    baseUrl,
  );

  const latestProject = await readTeacherProject(projectId);
  if (!latestProject) throw new Error('Project disappeared during generation');

  await writeTeacherProject(
    applyChapterClassroomUpdate(latestProject, {
      chapterId,
      classroomId,
      status: 'ready',
      sceneCount: scenes.length,
      createdAt: previousChapterClassroom?.createdAt ?? now,
      updatedAt: new Date().toISOString(),
    }),
  );

  return {
    kind: 'ready',
    classroomId,
    sceneCount: scenes.length,
    missingTemplateIds: chapterInput.missingTemplateIds,
  };
}
