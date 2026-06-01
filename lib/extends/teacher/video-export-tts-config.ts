/**
 * @extends-from lib/teacher/video-export-tts-config.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { TTS_PROVIDERS } from '@/lib/audio/constants';
import { isCustomTTSProvider, type TTSProviderId } from '@/lib/audio/types';
import { useSettingsStore } from '@/lib/store/settings';

export function isExportCapableTtsProvider(
  providerId: TTSProviderId,
  config:
    | {
        isServerConfigured?: boolean;
        apiKey?: string;
        enabled?: boolean;
      }
    | undefined,
): boolean {
  if (providerId === 'browser-native-tts') {
    return false;
  }
  // Server .env / YAML config wins over the UI "enabled" toggle (export-only path).
  if (config?.isServerConfigured) {
    return true;
  }
  if (config?.enabled === false) {
    return false;
  }
  if (config?.apiKey?.trim()) {
    return true;
  }
  if (isCustomTTSProvider(providerId)) {
    return Boolean(config?.apiKey?.trim() || config?.isServerConfigured);
  }
  const builtIn = TTS_PROVIDERS[providerId as keyof typeof TTS_PROVIDERS];
  if (builtIn && !builtIn.requiresApiKey && builtIn.defaultBaseUrl) {
    return true;
  }
  return false;
}

/** Pick the best TTS provider for video export (server-configured first). */
export function pickExportTtsProviderId(): TTSProviderId | null {
  const { ttsProvidersConfig } = useSettingsStore.getState();
  const serverFirst: TTSProviderId[] = [];
  const clientKey: TTSProviderId[] = [];
  const keyless: TTSProviderId[] = [];

  for (const [id, config] of Object.entries(ttsProvidersConfig)) {
    const providerId = id as TTSProviderId;
    if (!isExportCapableTtsProvider(providerId, config)) {
      continue;
    }
    if (config?.isServerConfigured) {
      serverFirst.push(providerId);
    } else if (config?.apiKey?.trim()) {
      clientKey.push(providerId);
    } else {
      keyless.push(providerId);
    }
  }

  const ordered = [...serverFirst, ...clientKey, ...keyless];
  return ordered[0] ?? null;
}

/**
 * Sync server provider flags and resolve a TTS provider for export only.
 * Does not change the user's playback TTS setting (e.g. browser-native-tts).
 */
export async function resolveExportTtsProviderForVideo(): Promise<TTSProviderId> {
  const store = useSettingsStore.getState();
  await store.fetchServerProviders();

  const chosen = pickExportTtsProviderId();
  if (!chosen) {
    throw new Error('NO_EXPORT_TTS_PROVIDER');
  }

  return chosen;
}

/** True when an export-capable TTS provider is configured on the server (.env / YAML). */
export function isServerExportTtsConfigured(): boolean {
  const { ttsProvidersConfig } = useSettingsStore.getState();
  return Object.entries(ttsProvidersConfig).some(([id, config]) =>
    isExportCapableTtsProvider(id as TTSProviderId, config) && Boolean(config?.isServerConfigured),
  );
}

export function getExportTtsProviderDisplayName(providerId: TTSProviderId): string {
  const builtIn = TTS_PROVIDERS[providerId as keyof typeof TTS_PROVIDERS];
  return builtIn?.name ?? providerId;
}

/** Map raw TTS API errors to user-facing export messages. */
export function formatVideoExportTtsError(error: string | undefined): string | undefined {
  if (!error) return undefined;
  if (/usage limit exceeded|2056|daily usage limit/i.test(error)) {
    return 'MiniMax TTS 今日额度已用尽，请明日再试或在 MiniMax 控制台升级套餐。';
  }
  if (/invalid api key|401|403|2049/i.test(error)) {
    return 'MiniMax TTS API Key 无效，请检查 .env.local 中的 TTS_MINIMAX_API_KEY 并重启 dev server。';
  }
  return error.length > 280 ? `${error.slice(0, 280)}…` : error;
}

/** @deprecated Use resolveExportTtsProviderForVideo — does not mutate settings */
export const ensureVideoExportTtsConfigured = resolveExportTtsProviderForVideo;
