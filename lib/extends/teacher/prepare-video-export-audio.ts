/**
 * @extends-from lib/teacher/prepare-video-export-audio.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { collectAudioFiles } from '@/lib/export/classroom-zip-utils';
import {
  attachCanonicalSpeechAudioIds,
  buildLecturePlan,
  canonicalSpeechAudioId,
  findMissingSpeechAudioSceneIds,
  lecturePlanSpeechCues,
  scenesNeedClientAudioUpload,
} from '@/lib/lecture-timeline';
import { resolveExportTtsProviderForVideo } from '@/lib/teacher/video-export-tts-config';
import { DEFAULT_TTS_VOICES } from '@/lib/audio/constants';
import type { TTSProviderId } from '@/lib/audio/types';
import { useSettingsStore } from '@/lib/store/settings';
import type { Scene } from '@/lib/types/stage';
import { db } from '@/lib/utils/database';

export { canonicalSpeechAudioId, scenesNeedClientAudioUpload } from '@/lib/lecture-timeline';

export interface PrepareVideoExportAudioResult {
  scenes: Scene[];
  missingSceneIds: string[];
  speechCueCount: number;
  lastTtsError?: string;
}

export interface PrepareVideoExportAudioOptions {
  signal?: AbortSignal;
  language?: string;
  onProgress?: (completed: number, total: number) => void;
}

const EXPORT_TTS_CONCURRENCY = 4;

async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  if (items.length === 0) return;
  let nextIndex = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      const index = nextIndex++;
      await worker(items[index]!, index);
    }
  });

  await Promise.all(runners);
}

/**
 * Generate one export narration clip and store in IndexedDB.
 * When the provider is server-configured, omit client credentials so the API uses server keys.
 */
export async function generateExportTtsAndStore(
  providerId: TTSProviderId,
  voice: string,
  audioId: string,
  text: string,
  options?: { language?: string; signal?: AbortSignal },
): Promise<void> {
  const settings = useSettingsStore.getState();
  const ttsProviderConfig = settings.ttsProvidersConfig?.[providerId];
  const useServerCredentials = Boolean(ttsProviderConfig?.isServerConfigured);

  const body: Record<string, unknown> = {
    text,
    audioId,
    ttsProviderId: providerId,
    ttsModelId: ttsProviderConfig?.modelId,
    ttsVoice: voice,
    ttsSpeed: settings.ttsSpeed,
  };

  if (!useServerCredentials) {
    body.ttsApiKey = ttsProviderConfig?.apiKey || undefined;
    body.ttsBaseUrl =
      ttsProviderConfig?.baseUrl || ttsProviderConfig?.customDefaultBaseUrl || undefined;
  }

  const response = await fetch('/api/generate/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options?.signal,
  });

  const data = await response
    .json()
    .catch(() => ({ success: false, error: response.statusText || 'Invalid TTS response' }));
  if (!response.ok || !data.success || !data.base64 || !data.format) {
    throw new Error(data.details || data.error || `TTS request failed: HTTP ${response.status}`);
  }

  const binary = atob(data.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: `audio/${data.format}` });
  await db.audioFiles.put({
    id: audioId,
    blob,
    format: data.format,
    createdAt: Date.now(),
  });
}

/**
 * Ensures every speech cue in the lecture plan has audio in IndexedDB (or server audioUrl).
 * Uses the same cue order as playback / server video timeline.
 */
export async function prepareScenesForVideoExport(
  scenes: Scene[],
  options?: PrepareVideoExportAudioOptions,
): Promise<PrepareVideoExportAudioResult> {
  const exportProviderId = await resolveExportTtsProviderForVideo();
  const exportVoice =
    (DEFAULT_TTS_VOICES as Record<string, string>)[exportProviderId] ||
    useSettingsStore.getState().ttsProvidersConfig[exportProviderId]?.customVoices?.[0]?.id ||
    'default';

  let withIds = attachCanonicalSpeechAudioIds(scenes);
  const speechCues = lecturePlanSpeechCues(buildLecturePlan(withIds));
  const pendingCues: typeof speechCues = [];

  for (const cue of speechCues) {
    if (cue.audioUrl) continue;
    const existing = await db.audioFiles.get(cue.audioId);
    if (existing) continue;
    pendingCues.push(cue);
  }

  let completed = 0;
  let lastTtsError: string | undefined;
  options?.onProgress?.(completed, pendingCues.length);

  await runWithConcurrency(
    pendingCues,
    EXPORT_TTS_CONCURRENCY,
    async (cue) => {
      try {
        await generateExportTtsAndStore(exportProviderId, exportVoice, cue.audioId, cue.text, {
          language: options?.language,
          signal: options?.signal,
        });
      } catch (err) {
        if (!lastTtsError) {
          lastTtsError = err instanceof Error ? err.message : String(err);
        }
      } finally {
        completed += 1;
        options?.onProgress?.(completed, pendingCues.length);
      }
    },
    options?.signal,
  );

  withIds = attachCanonicalSpeechAudioIds(withIds);

  const missingSceneIds = await findMissingSpeechAudioSceneIds(withIds, async (cue) => {
    if (cue.audioUrl) return true;
    const record = await db.audioFiles.get(cue.audioId);
    return Boolean(record);
  });

  return {
    scenes: withIds,
    missingSceneIds,
    speechCueCount: speechCues.length,
    lastTtsError,
  };
}

export async function buildExportAudioZip(scenes: Scene[]): Promise<Blob | null> {
  if (!scenesNeedClientAudioUpload(scenes)) {
    return null;
  }

  const audioFiles = await collectAudioFiles(scenes);
  if (audioFiles.length === 0) {
    return null;
  }

  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  for (const entry of audioFiles) {
    const ext = entry.record.format || 'mp3';
    zip.file(`audio/${entry.record.id}.${ext}`, entry.record.blob);
  }

  return zip.generateAsync({ type: 'blob' });
}
