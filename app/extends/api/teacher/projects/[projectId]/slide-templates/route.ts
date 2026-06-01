/**
 * @extends-from app/api/extends/teacher/projects/[projectId]/slide-templates/route.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { type NextRequest } from 'next/server';
import { nanoid } from 'nanoid';

import { listBuiltinSlideTemplates } from '@/lib/slide-templates/builtins';
import {
  listProjectSlideTemplates,
  writeProjectSlideTemplate,
} from '@/lib/slide-templates/project-storage';
import { slideTemplateSchema } from '@/lib/slide-templates/schema';
import type { SlideTemplateRecord } from '@/lib/slide-templates/types';
import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';
import {
  isValidTeacherProjectId,
  readTeacherProject,
} from '@/lib/teacher/course-project-storage';

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

const createProjectSlideTemplateSchema = slideTemplateSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  scope: true,
  projectId: true,
});

function parseIncludeBuiltin(request: NextRequest): boolean {
  return request.nextUrl.searchParams.get('includeBuiltin') === '1';
}

async function requireTeacherProject(projectId: string) {
  if (!isValidTeacherProjectId(projectId)) {
    return { error: apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid teacher project id') };
  }

  const project = await readTeacherProject(projectId);
  if (!project) {
    return { error: apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Teacher project not found') };
  }

  return { project };
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const result = await requireTeacherProject(projectId);
    if ('error' in result) {
      return result.error;
    }

    const templates = await listProjectSlideTemplates(projectId);
    if (parseIncludeBuiltin(request)) {
      const builtins = listBuiltinSlideTemplates();
      return apiSuccess({ templates: [...builtins, ...templates] });
    }

    return apiSuccess({ templates });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to list project slide templates',
      message,
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    const result = await requireTeacherProject(projectId);
    if ('error' in result) {
      return result.error;
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid JSON body');
    }

    const parsed = createProjectSlideTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        400,
        parsed.error.issues[0]?.message ?? 'Invalid request body',
      );
    }

    const template = await writeProjectSlideTemplate(projectId, {
      ...(parsed.data as Omit<
        SlideTemplateRecord,
        'id' | 'scope' | 'projectId' | 'createdAt' | 'updatedAt'
      >),
      id: nanoid(),
    });

    return apiSuccess({ template }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to create project slide template',
      message,
    );
  }
}
