/**
 * @extends-from lib/server/video-export/ensure-classroom-narration.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { createLogger } from '@/lib/logger';
import { formatVideoExportTtsError } from '@/lib/teacher/video-export-tts-config';
import { getServerTTSProviders } from '@/lib/server/provider-config';
import { readClassroom, updateClassroom } from '@/lib/server/classroom-storage';
import { generateExportNarrationOnServer } from '@/lib/server/video-export/generate-export-narration';
import type { SpeechAction } from '@/lib/types/action';
import type { Scene, Stage } from '@/lib/types/stage';

const log = createLogger('VideoExportNarration');

export function scenesNeedServerNarration(scenes: Scene[]): boolean {
  for (const scene of scenes) {
    for (const action of scene.actions ?? []) {
      if (action.type === 'speech' && (action as SpeechAction).text) {
        const speech = action as SpeechAction;
        if (!speech.audioUrl) {
          return true;
        }
      }
    }
  }
  return false;
}

function cloneScenes(scenes: Scene[]): Scene[] {
  return JSON.parse(JSON.stringify(scenes)) as Scene[];
}

/**
 * When server TTS is configured in .env, generate missing narration files
 * and persist audioUrl on scene actions (same as classroom generation).
 */
export async function ensureClassroomNarrationOnServer(options: {
  classroomId: string;
  stage: Stage;
  scenes: Scene[];
  baseUrl: string;
}): Promise<Scene[]> {
  if (!scenesNeedServerNarration(options.scenes)) {
    return options.scenes;
  }

  const serverTts = Object.keys(getServerTTSProviders()).filter(
    (id) => id !== 'browser-native-tts',
  );
  if (serverTts.length === 0) {
    log.info('No server TTS provider configured; narration must come from the client');
    return options.scenes;
  }

  const scenes = cloneScenes(options.scenes);
  try {
    await generateExportNarrationOnServer(scenes, options.classroomId, options.baseUrl);
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const friendly = formatVideoExportTtsError(raw) ?? raw;
    throw new Error(friendly);
  }

  if (scenesNeedServerNarration(scenes)) {
    log.warn('Server TTS did not produce audioUrl for all speech actions');
  }

  await updateClassroom(
    {
      id: options.classroomId,
      stage: options.stage,
      scenes,
    },
    options.baseUrl,
  );

  const refreshed = await readClassroom(options.classroomId);
  return refreshed?.scenes ?? scenes;
}
