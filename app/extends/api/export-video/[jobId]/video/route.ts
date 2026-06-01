/**
 * @extends-from app/api/extends/export-video/[jobId]/video/route.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { type NextRequest } from 'next/server';
import { apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { isValidVideoExportJobId, readVideoExportJob } from '@/lib/server/video-export-job-store';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;

  if (!isValidVideoExportJobId(jobId)) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid video export job id');
  }

  const job = await readVideoExportJob(jobId);
  const videoPath = job?.artifact?.videoPath;
  if (!job || job.status !== 'succeeded' || !videoPath) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Video export output not found');
  }

  try {
    await stat(videoPath);
  } catch {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Video file missing on server');
  }

  const download = request.nextUrl.searchParams.get('download') === '1';
  const stream = createReadStream(videoPath);
  const headers = new Headers({
    'content-type': 'video/mp4',
    'cache-control': 'private, max-age=3600',
  });
  if (download) {
    headers.set('content-disposition', `attachment; filename="lecture-${jobId}.mp4"`);
  }

  return new Response(stream as unknown as BodyInit, { headers });
}
