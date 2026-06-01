/**
 * @extends-from app/api/extends/export-video/[jobId]/artifact/route.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { promises as fs } from 'fs';
import { type NextRequest } from 'next/server';
import { apiError, API_ERROR_CODES } from '@/lib/server/api-response';
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
  const artifactPath = job?.artifact?.artifactPath;
  if (!job?.artifact || !artifactPath) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Video export artifact not found');
  }

  const content = await fs.readFile(artifactPath, 'utf-8');
  return new Response(content, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${job.id}.render-plan.json"`,
    },
  });
}
