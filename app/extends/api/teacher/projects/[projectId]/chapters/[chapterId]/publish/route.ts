/**
 * @extends-from app/api/extends/teacher/projects/[projectId]/chapters/[chapterId]/publish/route.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';
import { applyChapterClassroomUpdate } from '@/lib/teacher/course-project';
import {
  isValidTeacherProjectId,
  readTeacherProject,
  writeTeacherProject,
} from '@/lib/teacher/course-project-storage';

type ChapterPublishRouteContext = {
  params: Promise<{ projectId: string; chapterId: string }>;
};

export async function POST(_request: Request, context: ChapterPublishRouteContext) {
  const { projectId, chapterId } = await context.params;

  if (!isValidTeacherProjectId(projectId)) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid teacher project id');
  }

  const project = await readTeacherProject(projectId);
  if (!project) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Teacher project not found');
  }

  const chapterClassroom = project.chapterClassrooms?.[chapterId];
  if (!chapterClassroom) {
    return apiError(
      API_ERROR_CODES.INVALID_REQUEST,
      404,
      'Chapter classroom not found — generate first',
    );
  }

  if (chapterClassroom.status !== 'ready' && chapterClassroom.status !== 'published') {
    return apiError(
      API_ERROR_CODES.INVALID_REQUEST,
      400,
      `Cannot publish chapter with status: ${chapterClassroom.status}`,
    );
  }

  // Idempotent: already published
  if (chapterClassroom.status === 'published') {
    return apiSuccess({ chapterClassroom });
  }

  const now = new Date().toISOString();
  const publishedClassroom = {
    ...chapterClassroom,
    status: 'published' as const,
    publishedAt: now,
    updatedAt: now,
  };
  const updatedProject = applyChapterClassroomUpdate(project, publishedClassroom);
  await writeTeacherProject(updatedProject);

  return apiSuccess({ chapterClassroom: publishedClassroom });
}
