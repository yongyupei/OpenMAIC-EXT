/**
 * @extends-from app/api/extends/teacher/projects/[projectId]/publish/route.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { type NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';
import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';
import {
  buildRequestOrigin,
  persistClassroom,
  readClassroom,
} from '@/lib/server/classroom-storage';
import {
  isValidTeacherProjectId,
  readTeacherProject,
  writeTeacherProject,
} from '@/lib/teacher/course-project-storage';
import { withRunStatus } from '@/lib/teacher/course-run-status';
import {
  buildStageFromTeacherProject,
  getPublishableScenes,
  validateTeacherProjectPublishable,
} from '@/lib/teacher/course-publish';
import type { Scene } from '@/lib/types/stage';
import type { CourseProject } from '@/lib/teacher/course-types';

type PublishRouteContext = {
  params: Promise<{ projectId: string }>;
};

const log = createLogger('Teacher Publish API');

export async function POST(request: NextRequest, context: PublishRouteContext) {
  let activeProject: CourseProject | undefined;

  const persistFailedRun = async () => {
    if (!activeProject) {
      return;
    }

    try {
      await writeTeacherProject(
        withRunStatus(activeProject, {
          step: 'publish',
          progress: 0,
          message: 'Failed to publish teacher project',
        }),
      );
    } catch (error) {
      log.error('Failed to persist teacher publish failure run:', error);
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

    const validation = validateTeacherProjectPublishable(project);
    if (!validation.ok) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, validation.statusCode, validation.reason);
    }

    activeProject = project;
    const publishingProject = withRunStatus(project, {
      step: 'publish',
      progress: 80,
      message: 'Publishing teacher project',
    });
    await writeTeacherProject(publishingProject);
    activeProject = publishingProject;

    const publishedChapterEntries = (project.outline?.chapters ?? [])
      .map((chapter) => project.chapterClassrooms?.[chapter.id])
      .filter((cc): cc is NonNullable<typeof cc> => cc !== undefined && cc.status === 'published');

    let scenes: Scene[];
    if (publishedChapterEntries.length > 0) {
      const classroomScenes = await Promise.all(
        publishedChapterEntries.map(async (cc) => {
          const classroom = await readClassroom(cc.classroomId);
          return classroom?.scenes ?? [];
        }),
      );
      scenes = classroomScenes.flat();

      if (scenes.length === 0) {
        await persistFailedRun();
        return apiError(
          API_ERROR_CODES.INVALID_REQUEST,
          400,
          'Published chapter classrooms exist but contain no scenes',
        );
      }
    } else {
      // Backward compatibility: use artifact-based scenes
      scenes = getPublishableScenes(project);
    }
    const now = Date.now();
    const stage = buildStageFromTeacherProject(project, scenes, now);
    const baseUrl = buildRequestOrigin(request);
    const classroom = await persistClassroom(
      {
        id: project.id,
        stage,
        scenes,
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

    return apiSuccess({
      project: updatedProject,
      classroomId: classroom.id,
      url: classroom.url,
    });
  } catch (error) {
    log.error('Teacher project publish route failed:', error);
    await persistFailedRun();
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to publish teacher project');
  }
}
