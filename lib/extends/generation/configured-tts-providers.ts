import { DEFAULT_TTS_MODELS, TTS_PROVIDERS } from '@/lib/audio/constants';
import { isCustomTTSProvider, type TTSProviderId } from '@/lib/audio/types';
import { isProviderUsable } from '@/lib/store/settings-validation';

export interface ConfiguredTtsProvider {
  readonly id: TTSProviderId;
  readonly name: string;
  readonly models: ReadonlyArray<{ readonly id: string; readonly name: string }>;
  readonly defaultModelId: string;
  /** True when API key or server config is available for generation. */
  readonly configured: boolean;
}

function modelsForProvider(
  providerId: TTSProviderId,
  config:
    | {
        modelId?: string;
        customModels?: Array<{ id: string; name: string }>;
      }
    | undefined,
): ReadonlyArray<{ readonly id: string; readonly name: string }> {
  const builtIn = TTS_PROVIDERS[providerId as keyof typeof TTS_PROVIDERS];
  const fromRegistry = builtIn?.models?.map((model) => ({ id: model.id, name: model.name })) ?? [];
  const fromCustom = config?.customModels?.map((model) => ({ id: model.id, name: model.name })) ?? [];
  const merged = [...fromRegistry, ...fromCustom.filter((m) => !fromRegistry.some((r) => r.id === m.id))];
  if (merged.length > 0) return merged;

  const fallbackId =
    config?.modelId?.trim() ||
    builtIn?.defaultModelId ||
    DEFAULT_TTS_MODELS[providerId as keyof typeof DEFAULT_TTS_MODELS] ||
    '';
  return fallbackId ? [{ id: fallbackId, name: fallbackId }] : [];
}

function isSelectableTtsProvider(
  providerId: TTSProviderId,
  config:
    | {
        apiKey?: string;
        isServerConfigured?: boolean;
        requiresApiKey?: boolean;
        baseUrl?: string;
      }
    | undefined,
): boolean {
  if (providerId === 'browser-native-tts') return false;

  const builtIn = TTS_PROVIDERS[providerId as keyof typeof TTS_PROVIDERS];
  return isProviderUsable({
    isServerConfigured: config?.isServerConfigured,
    apiKey: config?.apiKey,
    requiresApiKey: config?.requiresApiKey ?? builtIn?.requiresApiKey,
    baseUrl: config?.baseUrl,
  });
}

/**
 * TTS providers/models selectable in generation settings UI.
 * Only includes providers with API key or server-side configuration.
 */
export function listSelectableTtsProviders(
  ttsProvidersConfig: Record<
    string,
    | {
        enabled?: boolean;
        apiKey?: string;
        isServerConfigured?: boolean;
        requiresApiKey?: boolean;
        baseUrl?: string;
        modelId?: string;
        customName?: string;
        customModels?: Array<{ id: string; name: string }>;
      }
    | undefined
  >,
): ConfiguredTtsProvider[] {
  const result: ConfiguredTtsProvider[] = [];
  const seen = new Set<string>();

  for (const [id, builtIn] of Object.entries(TTS_PROVIDERS)) {
    const providerId = id as TTSProviderId;
    if (providerId === 'browser-native-tts') continue;

    const config = ttsProvidersConfig[providerId];
    if (!isSelectableTtsProvider(providerId, config)) continue;

    const models = modelsForProvider(providerId, config);
    const defaultModelId =
      config?.modelId?.trim() ||
      builtIn.defaultModelId ||
      DEFAULT_TTS_MODELS[providerId as keyof typeof DEFAULT_TTS_MODELS] ||
      models[0]?.id ||
      '';

    result.push({
      id: providerId,
      name: builtIn.name,
      models: models.length > 0 ? models : [{ id: defaultModelId, name: defaultModelId }],
      defaultModelId,
      configured: true,
    });
    seen.add(providerId);
  }

  for (const [id, config] of Object.entries(ttsProvidersConfig)) {
    const providerId = id as TTSProviderId;
    if (seen.has(providerId) || !isCustomTTSProvider(providerId)) continue;
    if (!isSelectableTtsProvider(providerId, config)) continue;

    const models = modelsForProvider(providerId, config);
    const defaultModelId = config?.modelId?.trim() || models[0]?.id || '';
    result.push({
      id: providerId,
      name: config?.customName?.trim() || providerId,
      models: models.length > 0 ? models : [{ id: defaultModelId, name: defaultModelId }],
      defaultModelId,
      configured: true,
    });
  }

  return result.sort((a, b) => a.name.localeCompare(b.name));
}

/** @deprecated Use listSelectableTtsProviders */
export function buildConfiguredTtsProviders(
  ttsProvidersConfig: Parameters<typeof listSelectableTtsProviders>[0],
): ConfiguredTtsProvider[] {
  return listSelectableTtsProviders(ttsProvidersConfig);
}
