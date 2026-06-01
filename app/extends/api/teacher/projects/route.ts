/**
 * @extends-from app/api/extends/teacher/projects/route.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { type NextRequest } from 'next/server';
import { nanoid } from 'nanoid';
import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';
import { createCourseProject } from '@/lib/teacher/course-project';
import { listTeacherProjects, writeTeacherProject } from '@/lib/teacher/course-project-storage';
import { toTeacherProjectListItems } from '@/lib/teacher/project-list-summary';

interface CreateProjectBody {
  title?: string;
  requirement?: string;
  overview?: string;
  chapters?: Array<{
    title: string;
    learningObjectives: string[];
    summary?: string;
  }>;
  targetAudience?: string;
  durationMinutes?: number;
}

export async function GET() {
  try {
    const projects = await listTeacherProjects();
    return apiSuccess({ projects: toTeacherProjectListItems(projects) });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to list teacher projects',
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INVALID_REQUEST,
      400,
      'Request body must be valid JSON',
      error instanceof Error ? error.message : String(error),
    );
  }

  if (!isCreateProjectBodyShape(body)) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid teacher project fields');
  }

  const requirement = body.requirement?.trim();
  const overview = body.overview?.trim();
  if (!requirement && !overview) {
    return apiError(
      API_ERROR_CODES.MISSING_REQUIRED_FIELD,
      400,
      'Either requirement or overview must be provided',
    );
  }

  try {
    const now = new Date().toISOString();
    const project = createCourseProject({
      id: nanoid(),
      title: body.title,
      requirement,
      overview,
      chapters: body.chapters,
      targetAudience: body.targetAudience,
      durationMinutes: body.durationMinutes,
      now,
    });
    await writeTeacherProject(project);
    return apiSuccess({ project }, 201);
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to create teacher project',
      error instanceof Error ? error.message : String(error),
    );
  }
}

function isCreateProjectBodyShape(body: unknown): body is CreateProjectBody {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return false;
  const candidate = body as Record<string, unknown>;
  if (candidate.title !== undefined && typeof candidate.title !== 'string') return false;
  if (candidate.requirement !== undefined && typeof candidate.requirement !== 'string')
    return false;
  if (candidate.overview !== undefined && typeof candidate.overview !== 'string') return false;
  if (candidate.chapters !== undefined) {
    if (!Array.isArray(candidate.chapters)) return false;
    for (const chapter of candidate.chapters) {
      if (
        typeof chapter !== 'object' ||
        chapter === null ||
        typeof (chapter as Record<string, unknown>).title !== 'string' ||
        !Array.isArray((chapter as Record<string, unknown>).learningObjectives)
      ) {
        return false;
      }
    }
  }
  if (candidate.targetAudience !== undefined && typeof candidate.targetAudience !== 'string')
    return false;
  if (candidate.durationMinutes !== undefined && typeof candidate.durationMinutes !== 'number')
    return false;
  return true;
}
