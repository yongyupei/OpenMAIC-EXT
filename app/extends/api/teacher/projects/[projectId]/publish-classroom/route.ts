/**
 * @extends-from app/api/extends/teacher/projects/[projectId]/publish-classroom/route.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { type NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';
import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';
import { buildRequestOrigin, persistClassroom } from '@/lib/server/classroom-storage';
import {
  isValidTeacherProjectId,
  readTeacherProject,
  writeTeacherProject,
} from '@/lib/teacher/course-project-storage';
import { withRunStatus } from '@/lib/teacher/course-run-status';
import type { CourseProject } from '@/lib/teacher/course-types';
import type { Scene, Stage } from '@/lib/types/stage';

type RouteContext = { params: Promise<{ projectId: string }> };

const log = createLogger('Teacher PublishClassroom API');

export async function POST(request: NextRequest, context: RouteContext) {
  let activeProject: CourseProject | undefined;

  const persistFailedRun = async () => {
    if (!activeProject) return;
    try {
      await writeTeacherProject(
        withRunStatus(activeProject, {
          step: 'publish',
          progress: 0,
          message: 'Failed to publish classroom',
        }),
      );
    } catch (error) {
      log.error('Failed to persist publish-classroom failure run:', error);
    }
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

    if (project.id !== projectId) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Teacher project id mismatch');
    }

    activeProject = project;

    const body = (await request.json()) as { stage: Stage; scenes: Scene[] };
    const { stage, scenes } = body;

    if (!stage || !Array.isArray(scenes)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'stage and scenes are required');
    }

    if (scenes.length === 0) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'scenes must not be empty');
    }

    /** Persisted classroom id is the teacher project id; align stage/scene ids so studio load matches. */
    const canonicalStageId = projectId;
    const normalizedStage: Stage = { ...stage, id: canonicalStageId };
    const normalizedScenes: Scene[] = scenes.map((s) => ({ ...s, stageId: canonicalStageId }));

    const baseUrl = buildRequestOrigin(request);
    const now = Date.now();
    const classroom = await persistClassroom(
      {
        id: projectId,
        stage: normalizedStage,
        scenes: normalizedScenes,
        sourceWorkflowId: project.workflowTemplateId,
      },
      baseUrl,
    );

    const updatedProject = withRunStatus(
      {
        ...project,
        status: 'published' as const,
        publishedClassroomId: classroom.id,
      },
      {
        step: 'idle',
        progress: 100,
        message: 'Published',
      },
      new Date(now).toISOString(),
    );
    await writeTeacherProject(updatedProject);

    log.info(`Published classroom ${classroom.id} for project ${projectId}`);

    return apiSuccess({ classroomId: classroom.id, url: classroom.url });
  } catch (error) {
    log.error('Teacher publish-classroom route failed:', error);
    await persistFailedRun();
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to publish classroom');
  }
}
