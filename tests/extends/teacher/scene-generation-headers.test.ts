import { beforeEach, describe, expect, test } from 'vitest';
import { useSettingsStore } from '@/lib/store/settings';
import {
  buildSceneGenerationRequestHeaders,
  getSceneGenerationModelReadinessError,
  withSceneGenerationThinkingConfig,
} from '@/lib/extends/teacher/scene-generation-headers';

describe('getSceneGenerationModelReadinessError', () => {
  test('reports missing custom provider configuration', () => {
    const message = getSceneGenerationModelReadinessError({
      generationProfileOverride: {
        providerId: 'custom-missing',
        modelId: 'test-model',
      },
    });
    expect(message).toMatch(/custom-missing/);
    expect(message).toMatch(/not configured/i);
  });

  test('returns null when provider and api key are configured', () => {
    useSettingsStore.setState({
      providersConfig: {
        anthropic: {
          name: 'Anthropic',
          type: 'anthropic',
          requiresApiKey: true,
          apiKey: 'sk-chapter',
          baseUrl: '',
          models: [{ id: 'claude-sonnet-4', name: 'Claude Sonnet 4' }],
        },
      },
    } as never);

    expect(
      getSceneGenerationModelReadinessError({
        generationProfileOverride: {
          providerId: 'anthropic',
          modelId: 'claude-sonnet-4',
        },
      }),
    ).toBeNull();
  });
});

describe('buildSceneGenerationRequestHeaders', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      providerId: 'openai',
      modelId: 'gpt-4o-mini',
      imageProviderId: 'openai-image',
      imageModelId: 'dall-e-3',
      imageProvidersConfig: {},
      videoProvidersConfig: {},
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
          apiKey: 'sk-chapter',
          baseUrl: '',
          models: [{ id: 'claude-sonnet-4', name: 'Claude Sonnet 4' }],
        },
      },
    } as never);
  });

  test('uses chapter override model headers when context is provided', () => {
    const headers = buildSceneGenerationRequestHeaders({
      generationProfileOverride: {
        providerId: 'anthropic',
        modelId: 'claude-sonnet-4',
      },
    });

    expect(headers['x-model']).toBe('anthropic:claude-sonnet-4');
    expect(headers['x-api-key']).toBe('sk-chapter');
  });

  test('falls back to global model when context is omitted', () => {
    const headers = buildSceneGenerationRequestHeaders(null);
    expect(headers['x-model']).toBe('openai:gpt-4o-mini');
    expect(headers['x-api-key']).toBe('sk-global');
  });
});

describe('withSceneGenerationThinkingConfig', () => {
  test('returns body unchanged when no chapter context', () => {
    const body = { outline: { id: 's1' } };
    expect(withSceneGenerationThinkingConfig(body, null)).toEqual(body);
  });
});
