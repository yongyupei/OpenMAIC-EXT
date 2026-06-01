/**
 * @extends-from app/api/extends/export-video/[jobId]/assets/route.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { after, type NextRequest } from 'next/server';
import { apiError, API_ERROR_CODES, apiSuccess } from '@/lib/server/api-response';
import { buildRequestOrigin } from '@/lib/server/classroom-storage';
import {
  isValidVideoExportJobId,
  readVideoExportJob,
  updateVideoExportJob,
  videoExportJobWorkDir,
} from '@/lib/server/video-export-job-store';
import { extractExportAssetsZip } from '@/lib/server/video-export/extract-assets';
import { runVideoExportJob } from '@/lib/server/video-export-runner';

export async function POST(
  request: NextRequest,
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

  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'Missing assets zip file');
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const workDir = job.workDir ?? videoExportJobWorkDir(jobId);
  await extractExportAssetsZip(buffer, workDir);

  const updated = await updateVideoExportJob(jobId, {
    step: 'collecting-assets',
    progress: Math.max(job.progress, 25),
    message: 'Client audio assets uploaded',
    assetsUploadedAt: new Date().toISOString(),
    workDir,
  });

  const baseUrl = buildRequestOrigin(request);
  after(async () => {
    const latest = await readVideoExportJob(jobId);
    if (latest && latest.status !== 'succeeded' && latest.status !== 'failed') {
      await runVideoExportJob(latest, baseUrl);
    }
  });

  return apiSuccess({ job: updated });
}
