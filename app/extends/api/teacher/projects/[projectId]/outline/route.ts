/**
 * @extends-from app/api/extends/teacher/projects/[projectId]/outline/route.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { type NextRequest } from 'next/server';
import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';
import type { CourseOutline, CourseProject } from '@/lib/teacher/course-types';
import {
  isValidTeacherProjectId,
  readTeacherProject,
  writeTeacherProject,
} from '@/lib/teacher/course-project-storage';

const COURSE_CHAPTER_STATUSES = new Set(['draft', 'dirty', 'generating', 'ready', 'failed']);
const SCENE_OUTLINE_TYPES = new Set(['slide', 'quiz', 'interactive', 'pbl']);

type OutlineRouteContext = {
  params: Promise<{ projectId: string }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function parseJsonBody(
  request: NextRequest,
): Promise<{ success: true; body: unknown } | { success: false }> {
  try {
    return { success: true, body: (await request.json()) as unknown };
  } catch {
    return { success: false };
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isValidSceneOutline(sceneOutline: unknown): boolean {
  if (!isRecord(sceneOutline)) {
    return false;
  }

  return (
    isNonEmptyString(sceneOutline.id) &&
    typeof sceneOutline.type === 'string' &&
    SCENE_OUTLINE_TYPES.has(sceneOutline.type) &&
    isNonEmptyString(sceneOutline.title) &&
    typeof sceneOutline.description === 'string' &&
    isStringArray(sceneOutline.keyPoints) &&
    typeof sceneOutline.order === 'number'
  );
}

function isValidCourseChapter(chapter: unknown): boolean {
  if (!isRecord(chapter)) {
    return false;
  }

  return (
    isNonEmptyString(chapter.id) &&
    isNonEmptyString(chapter.title) &&
    isStringArray(chapter.learningObjectives) &&
    Array.isArray(chapter.sceneOutlines) &&
    chapter.sceneOutlines.every(isValidSceneOutline) &&
    typeof chapter.status === 'string' &&
    COURSE_CHAPTER_STATUSES.has(chapter.status) &&
    typeof chapter.dirty === 'boolean' &&
    typeof chapter.locked === 'boolean' &&
    typeof chapter.order === 'number'
  );
}

function isValidCourseOutline(outline: unknown, projectId: string): outline is CourseOutline {
  if (!isRecord(outline)) {
    return false;
  }

  return (
    outline.projectId === projectId &&
    typeof outline.revision === 'number' &&
    (outline.languageDirective === undefined || typeof outline.languageDirective === 'string') &&
    Array.isArray(outline.chapters) &&
    outline.chapters.every(isValidCourseChapter)
  );
}

async function saveOutline(request: NextRequest, context: OutlineRouteContext) {
  try {
    const { projectId } = await context.params;
    if (!isValidTeacherProjectId(projectId)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid teacher project id');
    }

    const project = await readTeacherProject(projectId);
    if (!project) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Teacher project not found');
    }

    const parsedBody = await parseJsonBody(request);
    if (!parsedBody.success || !isRecord(parsedBody.body)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid request body');
    }

    const outline = parsedBody.body.outline;
    if (!outline || typeof outline !== 'object') {
      return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'outline is required');
    }
    if (!isValidCourseOutline(outline, projectId)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid outline payload');
    }

    const updatedProject: CourseProject = {
      ...project,
      outline,
      status: 'outline-ready',
      updatedAt: new Date().toISOString(),
    };
    await writeTeacherProject(updatedProject);

    return apiSuccess({ project: updatedProject });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to save teacher project outline',
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function PUT(request: NextRequest, context: OutlineRouteContext) {
  return saveOutline(request, context);
}

export async function POST(request: NextRequest, context: OutlineRouteContext) {
  return saveOutline(request, context);
}
