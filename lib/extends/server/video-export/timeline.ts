/**
 * @extends-from lib/server/video-export/timeline.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { access } from 'fs/promises';
import path from 'path';
import { buildLecturePlan, type LectureSpeechCue } from '@/lib/lecture-timeline';
import type { Scene } from '@/lib/types/stage';

import {
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
  DEFAULT_SLIDE_MS,
  DEFAULT_SUMMARY_MS,
} from '@/lib/video-export/constants';

export { VIDEO_WIDTH, VIDEO_HEIGHT, DEFAULT_SLIDE_MS, DEFAULT_SUMMARY_MS };

const AUDIO_EXTENSIONS = ['mp3', 'wav', 'm4a', 'webm', 'ogg'] as const;

export class VideoExportValidationError extends Error {
  constructor(
    message: string,
    readonly missingAudioSceneIds: string[],
  ) {
    super(message);
    this.name = 'VideoExportValidationError';
  }
}

export interface VideoTimelineSegment {
  sceneId: string;
  sceneType: Scene['type'];
  renderMode: 'slide' | 'summary';
  durationMs: number;
  audioPath?: string;
  actionId?: string;
}

export interface VideoTimeline {
  width: number;
  height: number;
  segments: VideoTimelineSegment[];
  durationMs: number;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveLocalAudioPath(
  cue: LectureSpeechCue,
  assetsDir: string,
): Promise<string | undefined> {
  for (const ext of AUDIO_EXTENSIONS) {
    const candidate = path.join(assetsDir, 'audio', `${cue.audioId}.${ext}`);
    if (await fileExists(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

export async function buildVideoTimeline(options: {
  scenes: Scene[];
  assetsDir: string;
  probeDurationMs?: (audioPath: string) => Promise<number>;
  resolveAudioUrl?: (audioUrl: string) => Promise<string | undefined>;
}): Promise<VideoTimeline> {
  const missingSceneIds: string[] = [];
  const segments: VideoTimelineSegment[] = [];
  const plan = buildLecturePlan(options.scenes);

  for (const cue of plan) {
    if (cue.kind === 'static') {
      segments.push({
        sceneId: cue.sceneId,
        sceneType: cue.sceneType,
        renderMode: cue.renderMode,
        durationMs: cue.renderMode === 'slide' ? DEFAULT_SLIDE_MS : DEFAULT_SUMMARY_MS,
      });
      continue;
    }

    let audioPath: string | undefined;
    if (cue.audioUrl) {
      audioPath = options.resolveAudioUrl
        ? await options.resolveAudioUrl(cue.audioUrl)
        : cue.audioUrl;
    }
    if (!audioPath) {
      audioPath = await resolveLocalAudioPath(cue, options.assetsDir);
    }

    if (!audioPath) {
      missingSceneIds.push(cue.sceneId);
      continue;
    }

    const durationMs = options.probeDurationMs
      ? await options.probeDurationMs(audioPath)
      : DEFAULT_SLIDE_MS;

    segments.push({
      sceneId: cue.sceneId,
      sceneType: cue.sceneType,
      renderMode: cue.renderMode,
      durationMs,
      audioPath,
      actionId: cue.actionId,
    });
  }

  const uniqueMissing = [...new Set(missingSceneIds)];
  if (uniqueMissing.length > 0) {
    throw new VideoExportValidationError(
      `Missing audio for ${uniqueMissing.length} scene(s)`,
      uniqueMissing,
    );
  }

  const durationMs = segments.reduce((total, segment) => total + segment.durationMs, 0);
  return {
    width: VIDEO_WIDTH,
    height: VIDEO_HEIGHT,
    segments,
    durationMs,
  };
}
