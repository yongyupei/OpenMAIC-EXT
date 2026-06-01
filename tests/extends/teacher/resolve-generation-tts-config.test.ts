import { beforeEach, describe, expect, it } from 'vitest';

import { useSettingsStore } from '@/lib/store/settings';
import { resolveGenerationTtsConfig } from '@/lib/extends/teacher/resolve-generation-tts-config';

describe('resolveGenerationTtsConfig', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      ttsProviderId: 'browser-native-tts',
      ttsProvidersConfig: {
        'openai-tts': {
          apiKey: 'test-key',
          baseUrl: '',
          enabled: true,
          modelId: 'gpt-4o-mini-tts',
        },
      },
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);
  });

  it('prefers course profile TTS over global settings', () => {
    const resolved = resolveGenerationTtsConfig({
      generationProfile: {
        workflowPresetId: 'default-course-generation',
        ttsProviderId: 'openai-tts',
        ttsModelId: 'tts-1-hd',
      },
    });

    expect(resolved).toEqual({
      providerId: 'openai-tts',
      modelId: 'tts-1-hd',
      source: 'course',
    });
  });

  it('falls back to configured global provider when course profile omits TTS', () => {
    useSettingsStore.setState({
      ttsProviderId: 'openai-tts',
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);

    const resolved = resolveGenerationTtsConfig({
      generationProfile: {
        workflowPresetId: 'default-course-generation',
      },
    });

    expect(resolved?.providerId).toBe('openai-tts');
    expect(resolved?.source).toBe('global');
  });

  it('uses chapter override when present', () => {
    const resolved = resolveGenerationTtsConfig({
      generationProfile: {
        workflowPresetId: 'default-course-generation',
        ttsProviderId: 'openai-tts',
        ttsModelId: 'tts-1',
      },
      generationProfileOverride: {
        ttsProviderId: 'openai-tts',
        ttsModelId: 'gpt-4o-mini-tts',
      },
    });

    expect(resolved).toEqual({
      providerId: 'openai-tts',
      modelId: 'gpt-4o-mini-tts',
      source: 'chapter',
    });
  });
});
