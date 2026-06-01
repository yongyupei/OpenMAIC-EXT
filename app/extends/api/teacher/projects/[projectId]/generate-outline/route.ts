/**
 * @extends-from app/api/extends/teacher/projects/[projectId]/generate-outline/route.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { type NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import { generateSceneOutlinesFromRequirements } from '@/lib/generation/outline-generator';
import { createLogger } from '@/lib/logger';
import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';
import { resolveModelForChapterGeneration } from '@/lib/extends/server/resolve-chapter-model';
import { prepareChapterGenerationInput } from '@/lib/teacher/chapter-generation-input';
import type { CourseChapter, CourseProject } from '@/lib/teacher/course-types';
import {
  isValidTeacherProjectId,
  readTeacherProject,
  writeTeacherProject,
} from '@/lib/teacher/course-project-storage';

type GenerateOutlineRouteContext = {
  params: Promise<{ projectId: string }>;
};

const log = createLogger('Teacher Outline API');

export const maxDuration = 300;

export async function POST(request: NextRequest, context: GenerateOutlineRouteContext) {
  try {
    const { projectId } = await context.params;
    if (!isValidTeacherProjectId(projectId)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid teacher project id');
    }

    const project = await readTeacherProject(projectId);
    if (!project) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Teacher project not found');
    }

    let body: { chapterId?: unknown };
    try {
      body = (await request.json()) as { chapterId?: unknown };
    } catch {
      body = {};
    }

    if (typeof body.chapterId !== 'string' || body.chapterId.length === 0) {
      return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'chapterId is required');
    }
    const chapterId = body.chapterId;

    const chapter = project.outline?.chapters.find((c) => c.id === chapterId);
    if (!chapter) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'chapter not found on project');
    }

    const {
      model: languageModel,
      modelInfo,
      thinkingConfig,
    } = await resolveModelForChapterGeneration(request, body, chapter, project);
    const aiCall = async (systemPrompt: string, userPrompt: string): Promise<string> => {
      const result = await callLLM(
        {
          model: languageModel,
          system: systemPrompt,
          prompt: userPrompt,
          maxOutputTokens: modelInfo?.outputWindow,
        },
        'teacher-outline-chapter',
        undefined,
        thinkingConfig,
      );
      return result.text;
    };

    const chapterInput = await prepareChapterGenerationInput(project, chapter, aiCall);

    const result = await generateSceneOutlinesFromRequirements(
      chapterInput.requirements,
      chapterInput.referenceText,
      undefined,
      aiCall,
      undefined,
      {
        teacherContext: chapterInput.teacherContext,
        researchContext: chapterInput.researchContext,
        generationMode: chapterInput.generationMode,
      },
    );
    if (!result.success || !result.data) {
      log.error('Failed to generate teacher chapter outline:', result.error);
      return apiError(API_ERROR_CODES.GENERATION_FAILED, 500, 'Failed to generate chapter outline');
    }

    const sceneOutlines = result.data.outlines.map((outline, index) => ({
      ...outline,
      order: index,
    }));

    const updatedChapter: CourseChapter = {
      ...chapter,
      sceneOutlines,
      status: 'draft',
      dirty: false,
    };

    const updatedProject: CourseProject = {
      ...project,
      outline: project.outline
        ? {
            ...project.outline,
            languageDirective: result.data.languageDirective ?? project.outline.languageDirective,
            chapters: project.outline.chapters.map((c) =>
              c.id === chapterId ? updatedChapter : c,
            ),
          }
        : undefined,
      status: 'outlining',
      updatedAt: new Date().toISOString(),
    };
    await writeTeacherProject(updatedProject);

    return apiSuccess({
      project: updatedProject,
      chapter: updatedChapter,
      ...(chapterInput.missingTemplateIds.length > 0
        ? { missingTemplateIds: chapterInput.missingTemplateIds }
        : {}),
    });
  } catch (error) {
    log.error('Teacher chapter outline generation route failed:', error);
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to generate teacher chapter outline',
    );
  }
}
