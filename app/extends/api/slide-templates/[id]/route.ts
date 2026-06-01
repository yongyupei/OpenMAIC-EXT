/**
 * @extends-from app/api/extends/slide-templates/[id]/route.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { type NextRequest } from 'next/server';

import { getBuiltinSlideTemplate } from '@/lib/slide-templates/builtins';
import { slideTemplateSchema } from '@/lib/slide-templates/schema';
import type { SlideTemplateRecord } from '@/lib/slide-templates/types';
import {
  deleteGlobalSlideTemplate,
  ensureSlideTemplatesInitialized,
  isValidSlideTemplateId,
  readGlobalSlideTemplate,
  writeGlobalSlideTemplate,
} from '@/lib/slide-templates/storage';
import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';

type RouteContext = {
  params: Promise<{ id: string }>;
};

const patchGlobalSlideTemplateSchema = slideTemplateSchema
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

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const builtin = getBuiltinSlideTemplate(id);
    if (builtin) {
      return apiSuccess({ template: builtin });
    }

    if (!isValidSlideTemplateId(id)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid slide template id');
    }

    await ensureSlideTemplatesInitialized();

    const template = await readGlobalSlideTemplate(id);
    if (!template) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Slide template not found');
    }

    return apiSuccess({ template });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to load slide template', message);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    if (getBuiltinSlideTemplate(id)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 405, 'Builtin slide templates cannot be modified');
    }

    if (!isValidSlideTemplateId(id)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid slide template id');
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid JSON body');
    }

    const parsed = patchGlobalSlideTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        400,
        parsed.error.issues[0]?.message ?? 'Invalid request body',
      );
    }

    await ensureSlideTemplatesInitialized();

    const existing = await readGlobalSlideTemplate(id);
    if (!existing) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Slide template not found');
    }

    const template = await writeGlobalSlideTemplate({
      ...existing,
      ...(parsed.data as Partial<
        Omit<SlideTemplateRecord, 'id' | 'scope' | 'createdAt' | 'updatedAt'>
      >),
      id,
    });

    return apiSuccess({ template });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to update slide template', message);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    if (getBuiltinSlideTemplate(id)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 405, 'Builtin slide templates cannot be deleted');
    }

    if (!isValidSlideTemplateId(id)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid slide template id');
    }

    await ensureSlideTemplatesInitialized();

    const deleted = await deleteGlobalSlideTemplate(id);
    if (!deleted) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Slide template not found');
    }

    return apiSuccess({ deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to delete slide template', message);
  }
}
