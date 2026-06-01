/**
 * @extends-from lib/server/video-export-job-store.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { promises as fs } from 'fs';
import path from 'path';
import { writeJsonFileAtomic } from '@/lib/server/classroom-storage';

export const VIDEO_EXPORT_JOBS_DIR = path.join(process.cwd(), 'data', 'video-export-jobs');
export const VIDEO_EXPORT_ARTIFACTS_DIR = path.join(process.cwd(), 'data', 'video-exports');

export type VideoExportJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';
export type VideoExportStep =
  | 'queued'
  | 'collecting-assets'
  | 'render-plan'
  | 'rendering'
  | 'encoding'
  | 'completed'
  | 'failed';
export type VideoExportStrategy = 'static' | 'recorded';

export interface VideoExportJobInput {
  classroomId: string;
  strategy?: VideoExportStrategy;
}

export interface VideoExportArtifact {
  videoPath: string;
  videoUrl: string;
  durationSeconds: number;
  width: number;
  height: number;
  format: 'mp4';
  /** @deprecated Legacy JSON render-plan URL */
  artifactUrl?: string;
  artifactPath?: string;
}

export interface VideoExportJob {
  id: string;
  classroomId: string;
  status: VideoExportJobStatus;
  step: VideoExportStep;
  progress: number;
  message: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  strategy: VideoExportStrategy;
  workDir?: string;
  assetsUploadedAt?: string;
  expectsClientAssets?: boolean;
  artifact?: VideoExportArtifact;
  error?: string;
}

function jobFilePath(jobId: string) {
  return path.join(VIDEO_EXPORT_JOBS_DIR, `${jobId}.json`);
}

async function ensureVideoExportJobsDir() {
  await fs.mkdir(VIDEO_EXPORT_JOBS_DIR, { recursive: true });
}

export async function ensureVideoExportArtifactsDir() {
  await fs.mkdir(VIDEO_EXPORT_ARTIFACTS_DIR, { recursive: true });
}

export function videoExportJobWorkDir(jobId: string): string {
  return path.join(VIDEO_EXPORT_ARTIFACTS_DIR, jobId);
}

export async function ensureVideoExportJobWorkDir(jobId: string): Promise<string> {
  const workDir = videoExportJobWorkDir(jobId);
  await fs.mkdir(workDir, { recursive: true });
  await fs.mkdir(path.join(workDir, 'audio'), { recursive: true });
  await fs.mkdir(path.join(workDir, 'frames'), { recursive: true });
  await fs.mkdir(path.join(workDir, 'segments'), { recursive: true });
  return workDir;
}

export function isValidVideoExportJobId(jobId: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(jobId);
}

export async function createVideoExportJob(
  jobId: string,
  input: VideoExportJobInput & { expectsClientAssets?: boolean },
): Promise<VideoExportJob> {
  const now = new Date().toISOString();
  const workDir = await ensureVideoExportJobWorkDir(jobId);
  const job: VideoExportJob = {
    id: jobId,
    classroomId: input.classroomId,
    status: 'queued',
    step: 'queued',
    progress: 0,
    message: 'Video export job queued',
    createdAt: now,
    updatedAt: now,
    strategy: input.strategy ?? 'static',
    workDir,
    expectsClientAssets: input.expectsClientAssets ?? false,
  };

  await ensureVideoExportJobsDir();
  await writeJsonFileAtomic(jobFilePath(jobId), job);
  return job;
}

export async function readVideoExportJob(jobId: string): Promise<VideoExportJob | null> {
  try {
    const content = await fs.readFile(jobFilePath(jobId), 'utf-8');
    return JSON.parse(content) as VideoExportJob;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function updateVideoExportJob(
  jobId: string,
  patch: Partial<VideoExportJob>,
): Promise<VideoExportJob> {
  const existing = await readVideoExportJob(jobId);
  if (!existing) {
    throw new Error(`Video export job not found: ${jobId}`);
  }

  const updated: VideoExportJob = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  await ensureVideoExportJobsDir();
  await writeJsonFileAtomic(jobFilePath(jobId), updated);
  return updated;
}

export async function markVideoExportJobRunning(jobId: string): Promise<VideoExportJob> {
  return updateVideoExportJob(jobId, {
    status: 'running',
    step: 'render-plan',
    progress: 10,
    message: 'Building video render plan',
    startedAt: new Date().toISOString(),
  });
}

export async function markVideoExportJobSucceeded(
  jobId: string,
  artifact: VideoExportArtifact,
): Promise<VideoExportJob> {
  return updateVideoExportJob(jobId, {
    status: 'succeeded',
    step: 'completed',
    progress: 100,
    message: 'Video export completed',
    completedAt: new Date().toISOString(),
    artifact,
  });
}

export async function markVideoExportJobFailed(
  jobId: string,
  error: string,
): Promise<VideoExportJob> {
  return updateVideoExportJob(jobId, {
    status: 'failed',
    step: 'failed',
    progress: 100,
    message: 'Video export failed',
    completedAt: new Date().toISOString(),
    error,
  });
}
