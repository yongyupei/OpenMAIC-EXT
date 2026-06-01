/**
 * @extends-from app/api/extends/teacher/projects/[projectId]/chapters/[chapterId]/generate/route.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { after, type NextRequest } from 'next/server';
import { executeChapterGenerationWorkflow } from '@/lib/generation/workflow/execute-chapter-workflow';
import { createLogger } from '@/lib/logger';
import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';
import { resolveModelForChapterGeneration } from '@/lib/extends/server/resolve-chapter-model';
import { applyChapterClassroomUpdate } from '@/lib/teacher/course-project';
import {
  isValidTeacherProjectId,
  readTeacherProject,
  writeTeacherProject,
} from '@/lib/teacher/course-project-storage';
import {
  parseSceneOutlinesFromBody,
  persistChapterSceneOutlines,
} from '@lib-extends/teacher/chapter-outline-edits';
import { aiTraceContext } from '@lib-extends/observability/trace-context';
import type {
  CourseChapterClassroom,
  CourseChapterClassroomFailedStep,
} from '@/lib/teacher/course-types';

type ChapterGenerateRouteContext = {
  params: Promise<{ projectId: string; chapterId: string }>;
};

const log = createLogger('Teacher Chapter Classroom Generate API');

/** Background workflow via `after()` — allow long multi-scene generation. */
export const maxDuration = 600;

function buildChapterClassroomId(projectId: string, chapterId: string): string {
  return `${projectId}-ch-${chapterId}`;
}

export async function POST(request: NextRequest, context: ChapterGenerateRouteContext) {
  const { projectId, chapterId } = await context.params;

  if (!isValidTeacherProjectId(projectId)) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid teacher project id');
  }

  const project = await readTeacherProject(projectId);
  if (!project) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Teacher project not found');
  }

  const chapter = project.outline?.chapters.find((c) => c.id === chapterId);
  if (!chapter) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Chapter not found in project outline');
  }

  if (chapter.locked) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Locked chapters cannot be generated');
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const resume = body.resume === true;
  const regenerate = body.regenerate === true;
  const approveOutline = body.approveOutline === true;

  if (approveOutline) {
    const editedOutlines = parseSceneOutlinesFromBody(body.sceneOutlines);
    if (editedOutlines) {
      await persistChapterSceneOutlines(projectId, chapterId, editedOutlines);
    }
  }

  const classroomId = buildChapterClassroomId(projectId, chapterId);
  const now = new Date().toISOString();
  const previousChapterClassroom = project.chapterClassrooms?.[chapterId];

  let modelResolution: Awaited<ReturnType<typeof resolveModelForChapterGeneration>>;
  try {
    modelResolution = await resolveModelForChapterGeneration(request, body, chapter, project);
  } catch (error) {
    log.error('Chapter model resolution failed:', error);
    const details = error instanceof Error ? error.message : String(error);
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Failed to resolve chapter model', details);
  }

  const { model: languageModel, modelInfo, thinkingConfig } = modelResolution;

  const freshProject = await readTeacherProject(projectId);
  if (!freshProject) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Teacher project not found');
  }

  const freshChapter = freshProject.outline?.chapters.find((c) => c.id === chapterId);
  if (!freshChapter) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Chapter not found in project outline');
  }

  try {
    await writeTeacherProject(
      applyChapterClassroomUpdate(freshProject, {
        chapterId,
        classroomId,
        status: 'generating',
        generationStep: 'outline',
        createdAt: previousChapterClassroom?.createdAt ?? now,
        updatedAt: now,
      }),
    );
  } catch (err) {
    log.warn('Failed to write generating status, continuing:', err);
  }

  after(async () => {
    let capturedTraceId: string | undefined;
    let partialSceneCount = 0;

    try {
      await aiTraceContext.run(
        {
          kind: 'chapter-generation',
          context: {
            projectId,
            chapterId,
            classroomId,
            userVisibleTitle: freshChapter.title,
            attempt: regenerate
              ? 'regenerate'
              : approveOutline
                ? 'approve'
                : resume
                  ? 'resume'
                  : 'initial',
          },
        },
        async () => {
          capturedTraceId = aiTraceContext.currentTraceId() ?? undefined;

          const outcome = await executeChapterGenerationWorkflow({
            request,
            projectId,
            chapterId,
            project: freshProject,
            chapter: freshChapter,
            classroomId,
            previousChapterClassroom,
            resume,
            regenerate,
            approveOutline,
            languageModel,
            modelInfo: modelInfo ?? undefined,
            thinkingConfig,
          });

          if (outcome.kind === 'awaiting-outline-approval') {
            log.info(
              `Chapter ${chapterId} awaiting outline approval (${outcome.sceneOutlineCount} outlines)`,
            );
            return;
          }

          partialSceneCount = outcome.sceneCount;
          log.info(`Chapter ${chapterId} generation completed (${outcome.sceneCount} scenes)`);
        },
      );
    } catch (error) {
      log.error('Chapter classroom generation failed:', error);
      try {
        const failedProject = await readTeacherProject(projectId);
        if (failedProject) {
          const failedStep: CourseChapterClassroomFailedStep =
            partialSceneCount > 0 ? 'scenes' : 'outline';
          const failedClassroom: CourseChapterClassroom = {
            chapterId,
            classroomId,
            status: 'failed',
            failedReason: error instanceof Error ? error.message : 'Unknown error',
            failedStep,
            sceneCount: partialSceneCount > 0 ? partialSceneCount : undefined,
            createdAt: previousChapterClassroom?.createdAt ?? now,
            updatedAt: new Date().toISOString(),
            ...(capturedTraceId ? { lastTraceId: capturedTraceId } : {}),
          };
          await writeTeacherProject(applyChapterClassroomUpdate(failedProject, failedClassroom));
        }
      } catch (writeErr) {
        log.error('Failed to write failure status:', writeErr);
      }
    }
  });

  return apiSuccess({
    classroomId,
    status: 'generating',
  });
}
