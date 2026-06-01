/**
 * @extends-from app/api/extends/teacher/projects/[projectId]/slide-templates/fork/route.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { type NextRequest } from 'next/server';
import { z } from 'zod';

import { forkSlideTemplateToProject } from '@/lib/slide-templates/project-storage';
import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';
import {
  isValidTeacherProjectId,
  readTeacherProject,
} from '@/lib/teacher/course-project-storage';

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

const forkBodySchema = z.object({
  sourceId: z.string().min(1),
});

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    if (!isValidTeacherProjectId(projectId)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid teacher project id');
    }

    const project = await readTeacherProject(projectId);
    if (!project) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Teacher project not found');
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid JSON body');
    }

    const parsed = forkBodySchema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        400,
        parsed.error.issues[0]?.message ?? 'Invalid request body',
      );
    }

    try {
      const template = await forkSlideTemplateToProject(projectId, parsed.data.sourceId);
      return apiSuccess({ template }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('not found')) {
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Source slide template not found');
      }
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to fork slide template',
      message,
    );
  }
}
