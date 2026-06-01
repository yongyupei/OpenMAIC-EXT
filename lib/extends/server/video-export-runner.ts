/**
 * @extends-from lib/server/video-export-runner.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import path from 'path';
import { createLogger } from '@/lib/logger';
import { appendPublishedArtifact, readClassroom } from '@/lib/server/classroom-storage';
import {
  markVideoExportJobFailed,
  markVideoExportJobRunning,
  markVideoExportJobSucceeded,
  readVideoExportJob,
  updateVideoExportJob,
  videoExportJobWorkDir,
  type VideoExportJob,
} from '@/lib/server/video-export-job-store';
import { buildVideoTimeline, VideoExportValidationError } from '@/lib/server/video-export/timeline';
import {
  concatMp4,
  encodeStillWithAudio,
  finalVideoPath,
  FfmpegNotAvailableError,
  isFfmpegAvailable,
  probeAudioDurationMs,
  segmentOutputPath,
} from '@/lib/server/video-export/ffmpeg';
import { captureSceneFrames } from '@/lib/server/video-export/playwright-render';
import { ensureClassroomNarrationOnServer } from '@/lib/server/video-export/ensure-classroom-narration';
import { resolveSpeechAudioPath } from '@/lib/server/video-export/resolve-classroom-audio';
import {
  findMissingSpeechAudioSceneIds,
  scenesNeedClientAudioUpload,
} from '@/lib/lecture-timeline';
import type { Scene } from '@/lib/types/stage';
import { serverCanGenerateExportNarration } from './video-export/server-export-tts';
import { formatVideoExportTtsError } from '@/lib/teacher/video-export-tts-config';

export { serverCanGenerateExportNarration };

const log = createLogger('VideoExportJob');
const runningJobs = new Map<string, Promise<void>>();

const ASSETS_WAIT_MS = 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Client must upload narration when speech exists without a server-side audioUrl. */
export function classroomNeedsClientAssets(scenes: Scene[]): boolean {
  return scenesNeedClientAudioUpload(scenes);
}

export function shouldDeferVideoExportUntilAssets(job: VideoExportJob): boolean {
  return Boolean(job.expectsClientAssets);
}

async function waitForClientAssets(jobId: string): Promise<void> {
  const deadline = Date.now() + ASSETS_WAIT_MS;
  while (Date.now() < deadline) {
    const job = await readVideoExportJob(jobId);
    if (job?.assetsUploadedAt) {
      return;
    }
    await sleep(500);
  }
  throw new Error('Timed out waiting for client audio assets upload');
}

export function runVideoExportJob(job: VideoExportJob, baseUrl: string): Promise<void> {
  const existing = runningJobs.get(job.id);
  if (existing) return existing;

  const promise = (async () => {
    try {
      if (!(await isFfmpegAvailable())) {
        throw new FfmpegNotAvailableError(
          'FFmpeg is not available on the server PATH. Install ffmpeg and ffprobe to export lecture videos.',
        );
      }

      await markVideoExportJobRunning(job.id);
      let classroom = await readClassroom(job.classroomId);
      if (!classroom) {
        throw new Error(`Classroom not found: ${job.classroomId}`);
      }

      await updateVideoExportJob(job.id, {
        step: 'collecting-assets',
        progress: 12,
        message: 'Generating narration audio on server',
      });

      const scenesAfterTts = await ensureClassroomNarrationOnServer({
        classroomId: job.classroomId,
        stage: classroom.stage,
        scenes: classroom.scenes,
        baseUrl,
      });
      classroom = { ...classroom, scenes: scenesAfterTts };

      const workDir = job.workDir ?? videoExportJobWorkDir(job.id);
      const audioCacheDir = path.join(workDir, 'audio-cache');

      const needsClientAssets = classroomNeedsClientAssets(classroom.scenes);

      if (needsClientAssets && !job.assetsUploadedAt) {
        if (job.expectsClientAssets) {
          await updateVideoExportJob(job.id, {
            step: 'collecting-assets',
            progress: 15,
            message: 'Waiting for client audio assets',
          });
          await waitForClientAssets(job.id);
        } else {
          const missingSceneIds = await findMissingSpeechAudioSceneIds(
            classroom.scenes,
            async (cue) => {
              if (cue.audioUrl) {
                const resolved = await resolveSpeechAudioPath({
                  audioUrl: cue.audioUrl,
                  classroomId: job.classroomId,
                  baseUrl,
                  cacheDir: audioCacheDir,
                });
                return Boolean(resolved);
              }
              return false;
            },
          );
          throw new VideoExportValidationError(
            formatVideoExportTtsError(
              serverCanGenerateExportNarration()
                ? 'Server narration generation failed. Check TTS_MINIMAX_API_KEY in .env.local and restart the dev server.'
                : 'Missing narration audio for video export',
            ) ??
              (serverCanGenerateExportNarration()
                ? 'Server narration generation failed. Check TTS_MINIMAX_API_KEY in .env.local and restart the dev server.'
                : 'Missing narration audio for video export'),
            missingSceneIds,
          );
        }
      }

      await updateVideoExportJob(job.id, {
        step: 'render-plan',
        progress: 30,
        message: 'Building video timeline',
      });

      const timeline = await buildVideoTimeline({
        scenes: classroom.scenes,
        assetsDir: workDir,
        probeDurationMs: probeAudioDurationMs,
        resolveAudioUrl: (audioUrl) =>
          resolveSpeechAudioPath({
            audioUrl,
            classroomId: job.classroomId,
            baseUrl,
            cacheDir: audioCacheDir,
          }),
      });

      await updateVideoExportJob(job.id, {
        step: 'rendering',
        progress: 50,
        message: 'Capturing scene frames',
      });

      const framePaths = await captureSceneFrames({
        baseUrl,
        jobId: job.id,
        classroomId: job.classroomId,
        segments: timeline.segments,
        framesDir: path.join(workDir, 'frames'),
      });

      await updateVideoExportJob(job.id, {
        step: 'encoding',
        progress: 75,
        message: 'Encoding video segments',
      });

      const segmentPaths: string[] = [];
      for (let index = 0; index < timeline.segments.length; index++) {
        const segment = timeline.segments[index];
        const imagePath = framePaths.get(segment.sceneId);
        if (!imagePath) {
          throw new Error(`Missing frame for scene ${segment.sceneId}`);
        }
        const outputPath = segmentOutputPath(workDir, index);
        await encodeStillWithAudio({
          imagePath,
          audioPath: segment.audioPath,
          durationMs: segment.durationMs,
          outputPath,
        });
        segmentPaths.push(outputPath);
      }

      const outputVideoPath = finalVideoPath(workDir, job.id);
      await concatMp4(segmentPaths, outputVideoPath);

      const videoUrl = `${baseUrl}/api/extends/export-video/${job.id}/video`;
      await markVideoExportJobSucceeded(job.id, {
        videoPath: outputVideoPath,
        videoUrl,
        durationSeconds: Math.round(timeline.durationMs / 1000),
        width: timeline.width,
        height: timeline.height,
        format: 'mp4',
      });

      await appendPublishedArtifact(classroom.id, {
        id: job.id,
        type: 'video',
        url: videoUrl,
        createdAt: new Date().toISOString(),
        status: 'succeeded',
      });
    } catch (error) {
      let message = error instanceof Error ? error.message : String(error);
      if (error instanceof VideoExportValidationError) {
        message = `${message}: ${error.missingAudioSceneIds.join(', ')}`;
      }
      log.error(`Video export job ${job.id} failed:`, error);
      await markVideoExportJobFailed(job.id, message);
    } finally {
      runningJobs.delete(job.id);
    }
  })();

  runningJobs.set(job.id, promise);
  return promise;
}
