/**
 * Classroom API — fork extension adds PUT for Studio save / template reset persist.
 */
import { randomUUID } from 'crypto';
import { type NextRequest } from 'next/server';

import { createLogger } from '@/lib/logger';
import { API_ERROR_CODES, apiError, apiSuccess } from '@/lib/server/api-response';
import {
  buildRequestOrigin,
  isValidClassroomId,
  persistClassroom,
  readClassroom,
  updateClassroom,
} from '@/lib/server/classroom-storage';
import type { Scene, Stage } from '@/lib/types/stage';

const log = createLogger('Classroom API');

function parseClassroomPayload(body: unknown): { id: string; stage: Stage; scenes: Scene[] } | null {
  if (typeof body !== 'object' || body === null) return null;
  const record = body as Record<string, unknown>;
  const stage = record.stage;
  const scenes = record.scenes;
  const id =
    typeof record.id === 'string' && record.id.trim().length > 0
      ? record.id.trim()
      : typeof stage === 'object' &&
          stage !== null &&
          typeof (stage as Stage).id === 'string' &&
          (stage as Stage).id.trim().length > 0
        ? (stage as Stage).id.trim()
        : null;

  if (!id || !stage || !Array.isArray(scenes)) {
    return null;
  }

  return { id, stage: stage as Stage, scenes: scenes as Scene[] };
}

export async function POST(request: NextRequest) {
  let stageId: string | undefined;
  let sceneCount: number | undefined;
  try {
    const body = await request.json();
    const parsed = parseClassroomPayload(body);
    if (!parsed) {
      return apiError(
        API_ERROR_CODES.MISSING_REQUIRED_FIELD,
        400,
        'Missing required fields: stage, scenes',
      );
    }

    stageId = parsed.stage.id;
    sceneCount = parsed.scenes.length;

    const id = parsed.stage.id || randomUUID();
    const baseUrl = buildRequestOrigin(request);

    const persisted = await persistClassroom(
      { id, stage: { ...parsed.stage, id }, scenes: parsed.scenes },
      baseUrl,
    );

    return apiSuccess({ id: persisted.id, url: persisted.url }, 201);
  } catch (error) {
    log.error(
      `Classroom storage failed [stageId=${stageId ?? 'unknown'}, scenes=${sceneCount ?? 0}]:`,
      error,
    );
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to store classroom',
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');

    if (!id) {
      return apiError(
        API_ERROR_CODES.MISSING_REQUIRED_FIELD,
        400,
        'Missing required parameter: id',
      );
    }

    if (!isValidClassroomId(id)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid classroom id');
    }

    const classroom = await readClassroom(id);
    if (!classroom) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Classroom not found');
    }

    return apiSuccess({ classroom });
  } catch (error) {
    log.error(
      `Classroom retrieval failed [id=${request.nextUrl.searchParams.get('id') ?? 'unknown'}]:`,
      error,
    );
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to retrieve classroom',
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function PUT(request: NextRequest) {
  let classroomId: string | undefined;
  try {
    const body = await request.json();
    const parsed = parseClassroomPayload(body);
    if (!parsed) {
      return apiError(
        API_ERROR_CODES.MISSING_REQUIRED_FIELD,
        400,
        'Missing required fields: id, stage, scenes',
      );
    }

    classroomId = parsed.id;
    if (!isValidClassroomId(parsed.id)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid classroom id');
    }

    const stageId = parsed.stage.id?.trim();
    if (stageId && stageId !== parsed.id) {
      return apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        400,
        'Classroom id does not match stage.id',
      );
    }

    const baseUrl = buildRequestOrigin(request);
    const updated = await updateClassroom(
      {
        id: parsed.id,
        stage: stageId ? parsed.stage : { ...parsed.stage, id: parsed.id },
        scenes: parsed.scenes,
      },
      baseUrl,
    );

    return apiSuccess({ id: updated.id, url: updated.url, revision: updated.revision });
  } catch (error) {
    log.error(`Classroom update failed [id=${classroomId ?? 'unknown'}]:`, error);
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to update classroom',
      error instanceof Error ? error.message : String(error),
    );
  }
}
