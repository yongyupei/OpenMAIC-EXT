/**
 * @extends-from app/api/extends/export-video/[jobId]/route.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { type NextRequest } from 'next/server';
import { apiError, API_ERROR_CODES, apiSuccess } from '@/lib/server/api-response';
import { isValidVideoExportJobId, readVideoExportJob } from '@/lib/server/video-export-job-store';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;

  if (!isValidVideoExportJobId(jobId)) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid video export job id');
  }

  const job = await readVideoExportJob(jobId);
  if (!job) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Video export job not found');
  }

  return apiSuccess({ job });
}
