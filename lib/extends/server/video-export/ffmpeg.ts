/**
 * @extends-from lib/server/video-export/ffmpeg.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'path';
import { writeFile } from 'fs/promises';

const execFileAsync = promisify(execFile);

export class FfmpegNotAvailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FfmpegNotAvailableError';
  }
}

export async function isFfmpegAvailable(): Promise<boolean> {
  try {
    await execFileAsync('ffmpeg', ['-version'], { windowsHide: true });
    await execFileAsync('ffprobe', ['-version'], { windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

export async function probeAudioDurationMs(audioPath: string): Promise<number> {
  const { stdout } = await execFileAsync(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      audioPath,
    ],
    { windowsHide: true },
  );
  const seconds = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`Invalid ffprobe duration for ${audioPath}: ${stdout}`);
  }
  return Math.round(seconds * 1000);
}

export async function encodeStillWithAudio(options: {
  imagePath: string;
  audioPath?: string;
  durationMs: number;
  outputPath: string;
}): Promise<void> {
  const durationSec = (options.durationMs / 1000).toFixed(3);
  const args = [
    '-y',
    '-loop',
    '1',
    '-i',
    options.imagePath,
    '-t',
    durationSec,
    '-vf',
    'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-r',
    '30',
  ];

  if (options.audioPath) {
    args.push('-i', options.audioPath, '-c:a', 'aac', '-b:a', '192k', '-shortest');
  } else {
    args.push('-an');
  }

  args.push(options.outputPath);

  await execFileAsync('ffmpeg', args, { windowsHide: true });
}

export async function concatMp4(segmentPaths: string[], outputPath: string): Promise<void> {
  if (segmentPaths.length === 0) {
    throw new Error('concatMp4 requires at least one segment');
  }
  if (segmentPaths.length === 1) {
    const { copyFile } = await import('fs/promises');
    await copyFile(segmentPaths[0], outputPath);
    return;
  }

  const listPath = `${outputPath}.concat.txt`;
  const listContent = segmentPaths
    .map((segmentPath) => `file '${segmentPath.replace(/'/g, "'\\''")}'`)
    .join('\n');
  await writeFile(listPath, listContent, 'utf-8');

  try {
    await execFileAsync(
      'ffmpeg',
      ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', outputPath],
      { windowsHide: true },
    );
  } finally {
    const { unlink } = await import('fs/promises');
    await unlink(listPath).catch(() => undefined);
  }
}

export function segmentOutputPath(workDir: string, index: number): string {
  return path.join(workDir, 'segments', `segment-${String(index).padStart(4, '0')}.mp4`);
}

export function finalVideoPath(workDir: string, jobId: string): string {
  return path.join(workDir, `${jobId}.mp4`);
}
