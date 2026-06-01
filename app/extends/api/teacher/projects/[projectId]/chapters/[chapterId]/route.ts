/**
 * @extends-from app/api/extends/teacher/projects/[projectId]/chapters/[chapterId]/route.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';
import {
  applyChapterClassroomUpdate,
  buildChapterClassroomGeneratingReset,
} from '@/lib/teacher/course-project';
import {
  isValidTeacherProjectId,
  readTeacherProject,
  writeTeacherProject,
} from '@/lib/teacher/course-project-storage';

type ChapterRouteContext = {
  params: Promise<{ projectId: string; chapterId: string }>;
};

export async function GET(_request: Request, context: ChapterRouteContext) {
  const { projectId, chapterId } = await context.params;

  if (!isValidTeacherProjectId(projectId)) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid teacher project id');
  }

  const project = await readTeacherProject(projectId);
  if (!project) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Teacher project not found');
  }

  const chapterClassroom = project.chapterClassrooms?.[chapterId] ?? null;
  return apiSuccess({ chapterClassroom });
}

function buildChapterClassroomId(projectId: string, chapterId: string): string {
  return `${projectId}-ch-${chapterId}`;
}

/** Marks chapter classroom as generating before the client opens the generate page. */
export async function PATCH(request: Request, context: ChapterRouteContext) {
  const { projectId, chapterId } = await context.params;

  if (!isValidTeacherProjectId(projectId)) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid teacher project id');
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.action !== 'start-generation') {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Unsupported chapter classroom action');
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

  const classroomId = buildChapterClassroomId(projectId, chapterId);
  const previous = project.chapterClassrooms?.[chapterId];
  const generatingClassroom = buildChapterClassroomGeneratingReset(
    chapterId,
    classroomId,
    previous,
  );

  const updated = await writeTeacherProject(applyChapterClassroomUpdate(project, generatingClassroom));
  const chapterClassroom = updated.chapterClassrooms?.[chapterId] ?? generatingClassroom;
  return apiSuccess({ chapterClassroom });
}
