import { describe, expect, it } from 'vitest';

import { listSelectableTtsProviders } from '@/lib/extends/generation/configured-tts-providers';

describe('listSelectableTtsProviders', () => {
  it('returns empty when no TTS providers are configured', () => {
    const providers = listSelectableTtsProviders({});
    expect(providers).toEqual([]);
  });

  it('lists providers with API key even when enabled flag is false', () => {
    const providers = listSelectableTtsProviders({
      'azure-tts': { apiKey: 'sk-test', enabled: false },
      'openai-tts': { enabled: true },
    });
    expect(providers.map((entry) => entry.id)).toEqual(['azure-tts']);
  });

  it('includes server-configured providers without client API key', () => {
    const providers = listSelectableTtsProviders({
      'openai-tts': { isServerConfigured: true, enabled: true },
    });
    expect(providers.some((entry) => entry.id === 'openai-tts')).toBe(true);
  });

  it('excludes keyless providers without an explicit baseUrl', () => {
    const providers = listSelectableTtsProviders({
      'lemonade-tts': { enabled: true },
      'voxcpm-tts': { enabled: true, baseUrl: 'http://127.0.0.1:8000' },
    });
    expect(providers.map((entry) => entry.id)).toEqual(['voxcpm-tts']);
  });
});
