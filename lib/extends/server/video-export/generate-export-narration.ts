/**
 * Server-side narration for video export — fails fast with the first TTS error (unlike batch classroom gen).
 */
import { promises as fs } from 'fs';
import path from 'path';
import { DEFAULT_TTS_MODELS, DEFAULT_TTS_VOICES, TTS_PROVIDERS } from '@/lib/audio/constants';
import { generateTTS } from '@/lib/audio/tts-providers';
import type { TTSProviderId } from '@/lib/audio/types';
import { VOXCPM_AUTO_VOICE_ID, VOXCPM_TTS_PROVIDER_ID } from '@/lib/audio/voxcpm';
import { createLogger } from '@/lib/logger';
import { formatVideoExportTtsError } from '@/lib/teacher/video-export-tts-config';
import { CLASSROOMS_DIR } from '@/lib/server/classroom-storage';
import { getServerTTSProviders, resolveTTSApiKey, resolveTTSBaseUrl } from '@/lib/server/provider-config';
import { splitLongSpeechActions } from '@/lib/audio/tts-utils';
import type { SpeechAction } from '@/lib/types/action';
import type { Scene } from '@/lib/types/stage';

const log = createLogger('VideoExportNarrationTTS');

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

function mediaServingUrl(baseUrl: string, classroomId: string, relativePath: string): string {
  return `${baseUrl}/api/classroom-media/${classroomId}/${relativePath}`;
}

/**
 * Generate missing speech audio on server; throws on first TTS failure with provider message.
 */
export async function generateExportNarrationOnServer(
  scenes: Scene[],
  classroomId: string,
  baseUrl: string,
): Promise<void> {
  const audioDir = path.join(CLASSROOMS_DIR, classroomId, 'audio');
  await ensureDir(audioDir);

  const ttsProviderIds = Object.keys(getServerTTSProviders()).filter(
    (id) => id !== 'browser-native-tts',
  );
  if (ttsProviderIds.length === 0) {
    throw new Error('No server TTS provider configured');
  }

  const providerId = ttsProviderIds[0] as TTSProviderId;
  const apiKey = resolveTTSApiKey(providerId);
  const ttsProvider = TTS_PROVIDERS[providerId as keyof typeof TTS_PROVIDERS];
  if (ttsProvider?.requiresApiKey && !apiKey) {
    throw new Error(`No API key for TTS provider "${providerId}"`);
  }
  const ttsBaseUrl = resolveTTSBaseUrl(providerId) || ttsProvider?.defaultBaseUrl;
  const voice = DEFAULT_TTS_VOICES[providerId as keyof typeof DEFAULT_TTS_VOICES] || 'default';
  const format = ttsProvider?.supportedFormats?.[0] || 'mp3';
  if (providerId === VOXCPM_TTS_PROVIDER_ID && voice === VOXCPM_AUTO_VOICE_ID) {
    throw new Error('VoxCPM Auto Voice requires agent context');
  }

  for (const scene of scenes) {
    if (!scene.actions) continue;
    scene.actions = splitLongSpeechActions(scene.actions, providerId);
    const sceneOrder = scene.order;

    for (const action of scene.actions) {
      if (action.type !== 'speech' || !(action as SpeechAction).text) continue;
      const speechAction = action as SpeechAction;
      if (speechAction.audioUrl) continue;

      const audioId = `tts_s${sceneOrder}_${action.id}`;
      try {
        const result = await generateTTS(
          {
            providerId,
            modelId: DEFAULT_TTS_MODELS[providerId as keyof typeof DEFAULT_TTS_MODELS] || '',
            apiKey,
            baseUrl: ttsBaseUrl,
            voice,
            speed: speechAction.speed,
          },
          speechAction.text,
        );

        const filename = `${audioId}.${result.format || format}`;
        await fs.writeFile(path.join(audioDir, filename), result.audio);

        speechAction.audioId = audioId;
        speechAction.audioUrl = mediaServingUrl(baseUrl, classroomId, `audio/${filename}`);
        log.info(`Generated export TTS: ${filename} (${result.audio.length} bytes)`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn(`Export TTS failed for action ${action.id}:`, err);
        throw new Error(formatVideoExportTtsError(message) ?? message);
      }
    }
  }
}
