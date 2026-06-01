/**
 * Server-side TTS for teacher chapter generation with explicit provider/model.
 */
import { promises as fs } from 'fs';
import path from 'path';

import { DEFAULT_TTS_VOICES, TTS_PROVIDERS } from '@/lib/audio/constants';
import { generateTTS } from '@/lib/audio/tts-providers';
import { splitLongSpeechActions } from '@/lib/audio/tts-utils';
import type { TTSProviderId } from '@/lib/audio/types';
import { VOXCPM_AUTO_VOICE_ID, VOXCPM_TTS_PROVIDER_ID } from '@/lib/audio/voxcpm';
import { createLogger } from '@/lib/logger';
import { CLASSROOMS_DIR } from '@/lib/server/classroom-storage';
import { resolveTTSApiKey, resolveTTSBaseUrl } from '@/lib/server/provider-config';
import type { SpeechAction } from '@/lib/types/action';
import type { Scene } from '@/lib/types/stage';
import { aiTraceContext } from '@lib-extends/observability/trace-context';

const log = createLogger('ChapterTtsGeneration');

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

function mediaServingUrl(baseUrl: string, classroomId: string, subPath: string): string {
  return `${baseUrl}/api/classroom-media/${classroomId}/${subPath}`;
}

export interface ChapterTtsGenerationOptions {
  readonly providerId: TTSProviderId;
  readonly modelId: string;
}

export async function generateChapterClassroomTts(
  scenes: Scene[],
  classroomId: string,
  baseUrl: string,
  options: ChapterTtsGenerationOptions,
): Promise<void> {
  return aiTraceContext.withSpan(
    {
      kind: 'tts-call',
      name: 'generateChapterClassroomTts',
      attrs: {
        source: classroomId,
        ttsProviderId: options.providerId,
        ttsModelId: options.modelId,
      },
    },
    async () => {
      const { providerId, modelId } = options;
      if (providerId === 'browser-native-tts') {
        log.warn('Browser-native TTS cannot run on server; skipping chapter TTS generation');
        return;
      }

      const audioDir = path.join(CLASSROOMS_DIR, classroomId, 'audio');
      await ensureDir(audioDir);

      const apiKey = resolveTTSApiKey(providerId);
      const ttsProvider = TTS_PROVIDERS[providerId as keyof typeof TTS_PROVIDERS];
      if (ttsProvider?.requiresApiKey && !apiKey) {
        log.warn(`No API key for TTS provider "${providerId}", skipping TTS generation`);
        return;
      }

      const ttsBaseUrl = resolveTTSBaseUrl(providerId) || ttsProvider?.defaultBaseUrl;
      const voice = DEFAULT_TTS_VOICES[providerId as keyof typeof DEFAULT_TTS_VOICES] || 'default';
      const format = ttsProvider?.supportedFormats?.[0] || 'mp3';

      if (providerId === VOXCPM_TTS_PROVIDER_ID && voice === VOXCPM_AUTO_VOICE_ID) {
        log.warn('VoxCPM Auto Voice requires agent context; skipping server-side TTS generation');
        return;
      }

      for (const scene of scenes) {
        if (!scene.actions) continue;
        scene.actions = splitLongSpeechActions(scene.actions, providerId);
        const sceneOrder = scene.order;

        for (const action of scene.actions) {
          if (action.type !== 'speech' || !(action as SpeechAction).text) continue;
          const speechAction = action as SpeechAction;
          const audioId = `tts_s${sceneOrder}_${action.id}`;

          try {
            const result = await generateTTS(
              {
                providerId,
                modelId,
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
            log.info(`Generated chapter TTS: ${filename} (${result.audio.length} bytes)`);
          } catch (err) {
            log.warn(`Chapter TTS generation failed for action ${action.id}:`, err);
          }
        }
      }
    },
  );
}
