/**
 * @extends-from tests/teacher/video-export-tts-config.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  formatVideoExportTtsError,
  isServerExportTtsConfigured,
  pickExportTtsProviderId,
} from '@/lib/teacher/video-export-tts-config';
import { useSettingsStore } from '@/lib/store/settings';

describe('pickExportTtsProviderId', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      ttsProviderId: 'browser-native-tts',
      ttsProvidersConfig: {
        'browser-native-tts': { apiKey: '', baseUrl: '', enabled: true },
        'openai-tts': { apiKey: '', baseUrl: '', enabled: true, isServerConfigured: true },
        'qwen-tts': { apiKey: 'client-key', baseUrl: '', enabled: true },
      },
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);
  });

  it('prefers server-configured TTS over client API key', () => {
    expect(pickExportTtsProviderId()).toBe('openai-tts');
  });

  it('falls back to client API key when no server TTS', () => {
    useSettingsStore.setState({
      ttsProvidersConfig: {
        'browser-native-tts': { apiKey: '', baseUrl: '', enabled: true },
        'qwen-tts': { apiKey: 'client-key', baseUrl: '', enabled: true },
      },
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);
    expect(pickExportTtsProviderId()).toBe('qwen-tts');
  });
});

describe('isServerExportTtsConfigured', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      ttsProvidersConfig: {
        'browser-native-tts': { apiKey: '', baseUrl: '', enabled: true },
        'minimax-tts': {
          apiKey: '',
          baseUrl: '',
          enabled: false,
          isServerConfigured: true,
        },
      },
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);
  });

  it('returns true when an export-capable provider is server-configured', () => {
    expect(isServerExportTtsConfigured()).toBe(true);
  });

  it('treats server-configured provider as export-capable even when enabled is false', () => {
    expect(
      pickExportTtsProviderId(),
    ).toBe('minimax-tts');
  });

  it('returns false when only browser-native is configured', () => {
    useSettingsStore.setState({
      ttsProvidersConfig: {
        'browser-native-tts': { apiKey: '', baseUrl: '', enabled: true },
      },
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);
    expect(isServerExportTtsConfigured()).toBe(false);
  });
});

describe('formatVideoExportTtsError', () => {
  it('maps MiniMax quota errors to a friendly message', () => {
    expect(
      formatVideoExportTtsError(
        'MiniMax TTS API error (2056): usage limit exceeded, daily usage limit reached',
      ),
    ).toContain('额度已用尽');
  });
});
