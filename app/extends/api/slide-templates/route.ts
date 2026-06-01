/**
 * @extends-from app/api/extends/slide-templates/route.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { type NextRequest } from 'next/server';
import { nanoid } from 'nanoid';

import { listBuiltinSlideTemplates } from '@/lib/slide-templates/builtins';
import { slideTemplateSchema } from '@/lib/slide-templates/schema';
import type { SlideTemplateRecord } from '@/lib/slide-templates/types';
import {
  ensureSlideTemplatesInitialized,
  listGlobalSlideTemplates,
  writeGlobalSlideTemplate,
} from '@/lib/slide-templates/storage';
import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';

const createGlobalSlideTemplateSchema = slideTemplateSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  scope: true,
  projectId: true,
});

function parseIncludeBuiltin(request: NextRequest): boolean {
  return request.nextUrl.searchParams.get('includeBuiltin') === '1';
}

export async function GET(request: NextRequest) {
  try {
    await ensureSlideTemplatesInitialized();

    const templates = await listGlobalSlideTemplates();
    if (parseIncludeBuiltin(request)) {
      const builtins = listBuiltinSlideTemplates();
      return apiSuccess({ templates: [...builtins, ...templates] });
    }

    return apiSuccess({ templates });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to list slide templates', message);
  }
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid JSON body');
    }

    const parsed = createGlobalSlideTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        400,
        parsed.error.issues[0]?.message ?? 'Invalid request body',
      );
    }

    await ensureSlideTemplatesInitialized();

    const template = await writeGlobalSlideTemplate({
      ...(parsed.data as Omit<SlideTemplateRecord, 'id' | 'scope' | 'createdAt' | 'updatedAt'>),
      id: nanoid(),
    });

    return apiSuccess({ template }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to create slide template', message);
  }
}
