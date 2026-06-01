import { DEFAULT_TTS_VOICES } from '@/lib/audio/constants';
import type { TTSProviderId } from '@/lib/audio/types';
import { VOXCPM_TTS_PROVIDER_ID } from '@/lib/audio/voxcpm';
import { getVoxCPMProviderOptions } from '@/lib/audio/voxcpm-voices';
import { isExportCapableTtsProvider } from '@/lib/extends/teacher/video-export-tts-config';
import { useSettingsStore } from '@/lib/store/settings';
import type { SpeechAction } from '@/lib/types/action';
import { db } from '@/lib/utils/database';

/**
 * Generate missing narration via /api/generate/tts and cache in IndexedDB for playback.
 * Returns audioId when cached successfully, otherwise null.
 */
export async function generateSpeechAudioOnDemand(
  speechAction: SpeechAction,
): Promise<string | null> {
  const settings = useSettingsStore.getState();
  const providerId = settings.ttsProviderId as TTSProviderId;
  if (providerId === 'browser-native-tts') return null;

  const providerConfig = settings.ttsProvidersConfig[providerId];
  if (!isExportCapableTtsProvider(providerId, providerConfig)) return null;

  const audioId = speechAction.audioId || `tts_playback_${speechAction.id}`;
  const existing = await db.audioFiles.get(audioId);
  if (existing) return audioId;

  const voice =
    settings.ttsVoice && settings.ttsVoice !== 'default'
      ? settings.ttsVoice
      : DEFAULT_TTS_VOICES[providerId as keyof typeof DEFAULT_TTS_VOICES] || 'default';

  const providerOptions =
    providerId === VOXCPM_TTS_PROVIDER_ID
      ? {
          ...(providerConfig?.providerOptions || {}),
          ...(await getVoxCPMProviderOptions(voice, {
            role: 'teacher',
          })),
        }
      : providerConfig?.providerOptions;

  const response = await fetch('/api/generate/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: speechAction.text,
      audioId,
      ttsProviderId: providerId,
      ttsModelId: providerConfig?.modelId,
      ttsVoice: voice,
      ttsSpeed: speechAction.speed ?? settings.ttsSpeed ?? 1,
      ttsApiKey: providerConfig?.isServerConfigured ? undefined : providerConfig?.apiKey,
      ttsBaseUrl:
        providerConfig?.serverBaseUrl ||
        providerConfig?.baseUrl ||
        providerConfig?.customDefaultBaseUrl,
      ttsProviderOptions: providerOptions,
    }),
  });

  if (!response.ok) return null;

  const data = (await response.json()) as {
    success?: boolean;
    base64?: string;
    format?: string;
  };
  if (!data.success || !data.base64) return null;

  const binary = atob(data.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: `audio/${data.format || 'mp3'}` });
  await db.audioFiles.put({
    id: audioId,
    blob,
    format: data.format || 'mp3',
    createdAt: Date.now(),
  });

  return audioId;
}
