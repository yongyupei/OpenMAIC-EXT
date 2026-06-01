/**
 * @extends-from app/api/extends/teacher/projects/[projectId]/slide-templates/[templateId]/route.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { type NextRequest } from 'next/server';

import {
  deleteProjectSlideTemplate,
  readProjectSlideTemplate,
  writeProjectSlideTemplate,
} from '@/lib/slide-templates/project-storage';
import { slideTemplateSchema } from '@/lib/slide-templates/schema';
import type { SlideTemplateRecord } from '@/lib/slide-templates/types';
import { isValidSlideTemplateId } from '@/lib/slide-templates/storage';
import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';
import {
  isValidTeacherProjectId,
  readTeacherProject,
} from '@/lib/teacher/course-project-storage';

type RouteContext = {
  params: Promise<{ projectId: string; templateId: string }>;
};

const patchProjectSlideTemplateSchema = slideTemplateSchema
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    scope: true,
    projectId: true,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

async function requireProjectTemplate(projectId: string, templateId: string) {
  if (!isValidTeacherProjectId(projectId)) {
    return { error: apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid teacher project id') };
  }
  if (!isValidSlideTemplateId(templateId)) {
    return { error: apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid slide template id') };
  }

  const project = await readTeacherProject(projectId);
  if (!project) {
    return { error: apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Teacher project not found') };
  }

  const template = await readProjectSlideTemplate(projectId, templateId);
  if (!template) {
    return { error: apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Slide template not found') };
  }
  if (template.scope !== 'project') {
    return {
      error: apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        405,
        'Only project-scoped slide templates can be modified',
      ),
    };
  }

  return { template };
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { projectId, templateId } = await context.params;
    const result = await requireProjectTemplate(projectId, templateId);
    if ('error' in result) {
      return result.error;
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid JSON body');
    }

    const parsed = patchProjectSlideTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        400,
        parsed.error.issues[0]?.message ?? 'Invalid request body',
      );
    }

    const template = await writeProjectSlideTemplate(projectId, {
      ...result.template,
      ...(parsed.data as Partial<
        Omit<SlideTemplateRecord, 'id' | 'scope' | 'projectId' | 'createdAt' | 'updatedAt'>
      >),
      id: templateId,
    });

    return apiSuccess({ template });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to update project slide template',
      message,
    );
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { projectId, templateId } = await context.params;
    const result = await requireProjectTemplate(projectId, templateId);
    if ('error' in result) {
      return result.error;
    }

    await deleteProjectSlideTemplate(projectId, templateId);
    return apiSuccess({ deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to delete project slide template',
      message,
    );
  }
}
