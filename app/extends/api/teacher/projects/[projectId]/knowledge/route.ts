/**
 * @extends-from app/api/extends/teacher/projects/[projectId]/knowledge/route.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { type NextRequest } from 'next/server';
import { z } from 'zod';

import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';
import {
  isValidTeacherProjectId,
  readTeacherProject,
  writeTeacherProject,
} from '@/lib/teacher/course-project-storage';

type KnowledgeRouteContext = {
  params: Promise<{ projectId: string }>;
};

const patchBodySchema = z.object({
  nodeIds: z.array(z.string().min(1)),
});

export async function PATCH(request: NextRequest, context: KnowledgeRouteContext) {
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
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid JSON');
    }

    const parsed = patchBodySchema.safeParse(body);
    if (!parsed.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid request body', parsed.error.message);
    }

    const updatedProject = {
      ...project,
      knowledge: { mount: { nodeIds: parsed.data.nodeIds } },
      updatedAt: new Date().toISOString(),
    };
    await writeTeacherProject(updatedProject);

    return apiSuccess({ project: updatedProject });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to update project knowledge mount',
      error instanceof Error ? error.message : String(error),
    );
  }
}
