import { beforeEach, describe, expect, test } from 'vitest';
import { useSettingsStore } from '@/lib/store/settings';
import {
  resolveChapterGenerationModelConfig,
  getTeacherGenerationHeadersForChapter,
} from '@/lib/extends/teacher/resolve-chapter-model-config';

describe('resolveChapterGenerationModelConfig', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      providerId: 'openai',
      modelId: 'gpt-4o-mini',
      providersConfig: {
        openai: {
          name: 'OpenAI',
          type: 'openai',
          requiresApiKey: true,
          apiKey: 'sk-global',
          baseUrl: '',
          models: [{ id: 'gpt-4o-mini', name: 'GPT-4o Mini' }],
        },
        anthropic: {
          name: 'Anthropic',
          type: 'anthropic',
          requiresApiKey: true,
          apiKey: 'sk-anthropic',
          baseUrl: '',
          models: [{ id: 'claude-sonnet-4', name: 'Claude Sonnet 4' }],
        },
      },
    } as never);
  });

  test('returns course default when chapter has no override', () => {
    const cfg = resolveChapterGenerationModelConfig({
      generationProfile: { providerId: 'anthropic', modelId: 'claude-sonnet-4' },
    });
    expect(cfg.providerId).toBe('anthropic');
    expect(cfg.modelId).toBe('claude-sonnet-4');
  });

  test('returns global config when chapter and course have no model', () => {
    const cfg = resolveChapterGenerationModelConfig(undefined);
    expect(cfg.providerId).toBe('openai');
    expect(cfg.modelId).toBe('gpt-4o-mini');
    expect(cfg.modelString).toBe('openai:gpt-4o-mini');
  });

  test('returns chapter override when providerId and modelId set', () => {
    const cfg = resolveChapterGenerationModelConfig({
      generationProfileOverride: {
        providerId: 'anthropic',
        modelId: 'claude-sonnet-4',
      },
    });
    expect(cfg.providerId).toBe('anthropic');
    expect(cfg.modelId).toBe('claude-sonnet-4');
    expect(cfg.apiKey).toBe('sk-anthropic');
  });

  test('falls back to global when override is partial', () => {
    const cfg = resolveChapterGenerationModelConfig({
      generationProfileOverride: { modelId: 'claude-sonnet-4' },
    });
    expect(cfg.providerId).toBe('openai');
    expect(cfg.modelId).toBe('gpt-4o-mini');
  });

  test('getTeacherGenerationHeadersForChapter sets x-model from override', () => {
    const headers = getTeacherGenerationHeadersForChapter({
      generationProfileOverride: {
        providerId: 'anthropic',
        modelId: 'claude-sonnet-4',
      },
    });
    expect(headers['x-model']).toBe('anthropic:claude-sonnet-4');
    expect(headers['x-api-key']).toBe('sk-anthropic');
  });
});
