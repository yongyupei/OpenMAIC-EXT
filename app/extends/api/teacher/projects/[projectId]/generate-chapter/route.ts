/**
 * @extends-from app/api/extends/teacher/projects/[projectId]/generate-chapter/route.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { type NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import {
  buildCompleteScene,
  generateSceneActions,
  generateSceneContent,
  type SceneGenerationContext,
} from '@/lib/generation/generation-pipeline';
import { applyOutlineFallbacks } from '@/lib/generation/outline-generator';
import { buildLanguageText } from '@/lib/generation/prompt-formatters';
import { uniquifyMediaElementIds } from '@/lib/generation/scene-builder';
import { getDefaultAgents } from '@/lib/orchestration/registry/store';
import { createLogger } from '@/lib/logger';
import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';
import { buildRequestOrigin } from '@/lib/server/classroom-storage';
import {
  generateMediaForClassroom,
  replaceMediaPlaceholders,
} from '@/lib/server/classroom-media-generation';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';
import { applyGeneratedChapterScenes } from '@/lib/teacher/course-project';
import {
  isValidTeacherProjectId,
  readTeacherProject,
  writeTeacherProject,
} from '@/lib/teacher/course-project-storage';
import { buildChapterSceneDeepSearchContext } from '@/lib/teacher/chapter-generation-enrichment';
import {
  buildChapterSceneGenerationContext,
  prepareChapterGenerationInput,
} from '@/lib/teacher/chapter-generation-input';
import { withRunStatus } from '@/lib/teacher/course-run-status';
import type { CourseProject } from '@/lib/teacher/course-types';
import type { Action } from '@/lib/types/action';
import type { SceneOutline } from '@/lib/types/generation';
import type { Scene } from '@/lib/types/stage';
import { aiTraceContext } from '@lib-extends/observability/trace-context';

type GenerateChapterRouteContext = {
  params: Promise<{ projectId: string }>;
};

const log = createLogger('Teacher Chapter API');
const PROJECT_CHANGED_ERROR = 'Project changed during generation';

function resolveTeacherChapterMediaBaseUrl(request: NextRequest): string {
  const forwardedHost = request.headers.get('x-forwarded-host');
  if (forwardedHost) {
    const proto = request.headers.get('x-forwarded-proto') || 'http';
    return `${proto}://${forwardedHost}`;
  }

  try {
    return buildRequestOrigin(request);
  } catch {
    const host = request.headers.get('host');
    return host ? `http://${host}` : 'http://localhost';
  }
}

export const maxDuration = 300;

async function persistChapterGenerationAbortedRun(
  project: CourseProject | null | undefined,
  chapterId: string | undefined,
  message: string,
) {
  if (!project || !chapterId) {
    return;
  }

  try {
    await writeTeacherProject(
      withRunStatus(project, {
        step: 'chapter-content',
        progress: 0,
        message,
        failedChapterId: chapterId,
      }),
    );
  } catch (error) {
    log.error('Failed to persist teacher chapter aborted run:', error);
  }
}

function createSceneOutlinesSignature(sceneOutlines: SceneOutline[]): string {
  return JSON.stringify(sceneOutlines);
}

function collectSpeechTexts(actions: Action[]): string[] {
  return actions
    .filter((action) => action.type === 'speech')
    .map((action) => action.text)
    .filter((text) => text.length > 0);
}

export async function POST(request: NextRequest, context: GenerateChapterRouteContext) {
  let activeProject: CourseProject | undefined;
  let activeChapterId: string | undefined;

  const persistFailedRun = async (message: string) => {
    await persistChapterGenerationAbortedRun(activeProject, activeChapterId, message);
  };

  try {
    const { projectId } = await context.params;
    if (!isValidTeacherProjectId(projectId)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid teacher project id');
    }

    const project = await readTeacherProject(projectId);
    if (!project) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Teacher project not found');
    }

    const body = await request.json().catch(() => ({}));
    const chapterId = typeof body.chapterId === 'string' ? body.chapterId : undefined;
    if (!chapterId) {
      return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'chapterId is required');
    }

    if (!project.outline) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Teacher project outline is required');
    }

    const chapter = project.outline.chapters.find((candidate) => candidate.id === chapterId);
    if (!chapter) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Chapter not found');
    }

    if (chapter.locked) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Locked chapters cannot be generated');
    }

    activeProject = project;
    activeChapterId = chapterId;
    await writeTeacherProject(
      withRunStatus(project, {
        step: 'chapter-content',
        progress: 5,
        message: `Generating chapter: ${chapter.title}`,
        failedChapterId: chapterId,
      }),
    );

    const {
      model: languageModel,
      modelInfo,
      thinkingConfig,
    } = await resolveModelFromRequest(request, body);
    const aiCall = async (systemPrompt: string, userPrompt: string): Promise<string> => {
      const result = await callLLM(
        {
          model: languageModel,
          system: systemPrompt,
          prompt: userPrompt,
          maxOutputTokens: modelInfo?.outputWindow,
        },
        'teacher-chapter',
        undefined,
        thinkingConfig,
      );
      return result.text;
    };

    const chapterInput = await prepareChapterGenerationInput(project, chapter, aiCall);
    const sceneResearchContext = await buildChapterSceneDeepSearchContext(
      project,
      chapter,
      chapterInput.referenceText,
      aiCall,
    );
    const sceneContext = buildChapterSceneGenerationContext(
      project,
      chapter,
      chapterInput.referenceText,
      sceneResearchContext,
      chapterInput.generationMode,
    );
    const agents = getDefaultAgents();
    const languageDirective = buildLanguageText(project.outline.languageDirective);
    const chapterOutlines = uniquifyMediaElementIds(chapter.sceneOutlines);
    const scenes: Scene[] = [];
    const sceneOutlinesSignature = createSceneOutlinesSignature(chapter.sceneOutlines);
    const allTitles = chapterOutlines.map((outline) => outline.title);
    const totalPages = chapterOutlines.length;
    let previousSpeeches: string[] = [];
    for (const [index, outline] of chapterOutlines.entries()) {
      const safeOutline = applyOutlineFallbacks(outline, true);
      const content = await generateSceneContent(safeOutline, aiCall, {
        agents,
        languageDirective,
        thinkingConfig,
        chapterDesignBrief: sceneContext.designBrief,
        chapterSlideVisualBrief: sceneContext.slideVisualBrief,
        resolvedTemplate: chapterInput.resolvedTemplate,
        ...(safeOutline.type === 'pbl' ? { languageModel } : {}),
      });
      if (!content) {
        log.error('Failed to generate teacher chapter scene content:', {
          projectId: project.id,
          chapterId,
          outlineId: outline.id,
        });
        await persistFailedRun('Failed to generate chapter scenes');
        return apiError(
          API_ERROR_CODES.GENERATION_FAILED,
          500,
          'Failed to generate chapter scenes',
        );
      }

      const ctx: SceneGenerationContext = {
        pageIndex: index + 1,
        totalPages,
        allTitles,
        previousSpeeches,
      };
      const actions = await generateSceneActions(safeOutline, content, aiCall, {
        ctx,
        agents,
        languageDirective,
        chapterDesignBrief: sceneContext.designBrief,
        researchContext: sceneContext.researchContext,
      });
      previousSpeeches = collectSpeechTexts(actions);
      const scene = buildCompleteScene(safeOutline, content, actions, project.id, {
        resolvedTemplate: chapterInput.resolvedTemplate,
      });
      if (!scene) {
        log.error('Failed to build teacher chapter scene:', {
          projectId: project.id,
          chapterId,
          outlineId: outline.id,
        });
        await persistFailedRun('Failed to generate chapter scenes');
        return apiError(
          API_ERROR_CODES.GENERATION_FAILED,
          500,
          'Failed to generate chapter scenes',
        );
      }
      scenes.push(scene);
    }

    try {
      const baseUrl = resolveTeacherChapterMediaBaseUrl(request);
      await aiTraceContext.run(
        {
          kind: 'chapter-media-generation',
          context: {
            projectId: project.id,
            chapterId,
            userVisibleTitle: chapter.title,
          },
        },
        async () => {
          const mediaMap = await generateMediaForClassroom(chapterOutlines, project.id, baseUrl);
          if (Object.keys(mediaMap).length > 0) {
            replaceMediaPlaceholders(scenes, mediaMap);
          }
        },
      );
    } catch (mediaError) {
      log.warn('Teacher chapter media generation failed, continuing without media:', mediaError);
    }

    const latestProject = await readTeacherProject(project.id);
    if (!latestProject?.outline) {
      await persistChapterGenerationAbortedRun(latestProject, chapterId, PROJECT_CHANGED_ERROR);
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 409, PROJECT_CHANGED_ERROR);
    }
    activeProject = latestProject;

    if (latestProject.outline.revision !== project.outline.revision) {
      await persistChapterGenerationAbortedRun(latestProject, chapterId, PROJECT_CHANGED_ERROR);
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 409, PROJECT_CHANGED_ERROR);
    }

    const latestChapter = latestProject.outline.chapters.find(
      (candidate) => candidate.id === chapterId,
    );
    if (!latestChapter || latestChapter.locked) {
      await persistChapterGenerationAbortedRun(latestProject, chapterId, PROJECT_CHANGED_ERROR);
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 409, PROJECT_CHANGED_ERROR);
    }
    if (createSceneOutlinesSignature(latestChapter.sceneOutlines) !== sceneOutlinesSignature) {
      await persistChapterGenerationAbortedRun(latestProject, chapterId, PROJECT_CHANGED_ERROR);
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 409, PROJECT_CHANGED_ERROR);
    }

    const updatedProject = applyGeneratedChapterScenes({
      project: latestProject,
      chapterId,
      scenes,
      generatedAt: new Date().toISOString(),
    });
    await writeTeacherProject(updatedProject);

    return apiSuccess({
      project: updatedProject,
      scenes,
      ...(chapterInput.missingTemplateIds.length > 0
        ? { missingTemplateIds: chapterInput.missingTemplateIds }
        : {}),
    });
  } catch (error) {
    log.error('Teacher chapter generation route failed:', error);
    await persistFailedRun('Failed to generate teacher project chapter');
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to generate teacher project chapter',
    );
  }
}
