/**
 * @extends-from app/api/extends/export-video/route.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { after, type NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { apiError, API_ERROR_CODES, apiSuccess } from '@/lib/server/api-response';
import {
  buildRequestOrigin,
  isValidClassroomId,
  readClassroom,
} from '@/lib/server/classroom-storage';
import { createVideoExportJob } from '@/lib/server/video-export-job-store';
import {
  classroomNeedsClientAssets,
  runVideoExportJob,
  serverCanGenerateExportNarration,
  shouldDeferVideoExportUntilAssets,
} from '@/lib/server/video-export-runner';
import { createLogger } from '@/lib/logger';

const log = createLogger('VideoExportAPI');

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const classroomId = body.classroomId;

    if (!classroomId) {
      return apiError(
        API_ERROR_CODES.MISSING_REQUIRED_FIELD,
        400,
        'Missing required field: classroomId',
      );
    }

    if (!isValidClassroomId(classroomId)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid classroom id');
    }

    const classroom = await readClassroom(classroomId);
    if (!classroom) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Classroom not found');
    }

    const needsClientAssets = classroomNeedsClientAssets(classroom.scenes);
    const clientWillUpload = body.clientWillUploadAssets === true;
    const serverFallback = body.serverNarrationFallback === true;
    const serverTts = serverCanGenerateExportNarration();

    const expectsClientAssets =
      clientWillUpload ||
      (needsClientAssets && !serverFallback && !serverTts);

    const job = await createVideoExportJob(randomUUID(), {
      classroomId,
      strategy: body.strategy === 'recorded' ? 'recorded' : 'static',
      expectsClientAssets,
    });
    const baseUrl = buildRequestOrigin(request);

    if (!shouldDeferVideoExportUntilAssets(job)) {
      after(async () => {
        await runVideoExportJob(job, baseUrl);
      });
    }

    return apiSuccess(
      {
        jobId: job.id,
        status: job.status,
        pollUrl: `/api/extends/export-video/${job.id}`,
      },
      202,
    );
  } catch (error) {
    log.error('Failed to create video export job:', error);
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to create video export job',
      error instanceof Error ? error.message : String(error),
    );
  }
}
