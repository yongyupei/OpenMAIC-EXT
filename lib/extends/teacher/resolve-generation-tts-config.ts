import { DEFAULT_TTS_MODELS, TTS_PROVIDERS } from '@/lib/audio/constants';
import type { TTSProviderId } from '@/lib/audio/types';
import { useSettingsStore } from '@/lib/store/settings';
import type {
  GenerationProfile,
  GenerationProfileOverride,
} from '@/lib/teacher/generation-profile';
import { listSelectableTtsProviders } from '@/lib/extends/generation/configured-tts-providers';
import { pickExportTtsProviderId } from '@/lib/extends/teacher/video-export-tts-config';

export type GenerationTtsConfigSource = 'chapter' | 'course' | 'global' | 'auto';

export interface ResolvedGenerationTtsConfig {
  readonly providerId: TTSProviderId;
  readonly modelId: string;
  readonly source: GenerationTtsConfigSource;
}

function resolveModelForProvider(
  providerId: TTSProviderId,
  explicitModelId: string | undefined,
): string {
  if (explicitModelId?.trim()) return explicitModelId.trim();
  const { ttsProvidersConfig } = useSettingsStore.getState();
  const fromSettings = ttsProvidersConfig[providerId]?.modelId?.trim();
  if (fromSettings) return fromSettings;
  const builtIn = TTS_PROVIDERS[providerId as keyof typeof TTS_PROVIDERS];
  if (builtIn?.defaultModelId) return builtIn.defaultModelId;
  return DEFAULT_TTS_MODELS[providerId as keyof typeof DEFAULT_TTS_MODELS] || '';
}

export function resolveGenerationTtsConfig(options: {
  readonly generationProfile?: GenerationProfile | null;
  readonly generationProfileOverride?: GenerationProfileOverride | null;
}): ResolvedGenerationTtsConfig | null {
  const { generationProfile, generationProfileOverride } = options;

  if (generationProfileOverride?.ttsProviderId) {
    const providerId = generationProfileOverride.ttsProviderId as TTSProviderId;
    const modelId = resolveModelForProvider(providerId, generationProfileOverride.ttsModelId);
    if (modelId) {
      return { providerId, modelId, source: 'chapter' };
    }
  }

  if (generationProfile?.ttsProviderId) {
    const providerId = generationProfile.ttsProviderId as TTSProviderId;
    const modelId = resolveModelForProvider(providerId, generationProfile.ttsModelId);
    if (modelId) {
      return { providerId, modelId, source: 'course' };
    }
  }

  const { ttsProviderId, ttsProvidersConfig } = useSettingsStore.getState();
  if (ttsProviderId && ttsProviderId !== 'browser-native-tts') {
    const configured = listSelectableTtsProviders(ttsProvidersConfig);
    if (configured.some((entry) => entry.id === ttsProviderId)) {
      const modelId = resolveModelForProvider(ttsProviderId, undefined);
      if (modelId) {
        return { providerId: ttsProviderId, modelId, source: 'global' };
      }
    }
  }

  const autoProviderId = pickExportTtsProviderId();
  if (!autoProviderId) return null;
  const modelId = resolveModelForProvider(autoProviderId, undefined);
  if (!modelId) return null;
  return { providerId: autoProviderId, modelId, source: 'auto' };
}

export function resolveCourseGenerationTtsConfig(options: {
  readonly generationProfile?: GenerationProfile | null;
}): ResolvedGenerationTtsConfig | null {
  return resolveGenerationTtsConfig(options);
}

export function resolveChapterGenerationTtsConfig(options: {
  readonly generationProfile?: GenerationProfile | null;
  readonly generationProfileOverride?: GenerationProfileOverride | null;
}): ResolvedGenerationTtsConfig | null {
  return resolveGenerationTtsConfig(options);
}

export function formatGenerationTtsLabel(
  config: ResolvedGenerationTtsConfig,
  providers: ReturnType<typeof listSelectableTtsProviders>,
): string {
  const provider = providers.find((entry) => entry.id === config.providerId);
  const model =
    provider?.models.find((entry) => entry.id === config.modelId)?.name ?? config.modelId;
  return `${provider?.name ?? config.providerId} / ${model}`;
}
