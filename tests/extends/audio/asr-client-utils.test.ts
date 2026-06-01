/**
 * @extends-from tests/audio/asr-client-utils.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, test } from 'vitest';

import {
  isServerAsrProviderUsable,
  pickServerAsrFallback,
  toBrowserSpeechLanguage,
} from '@/lib/audio/asr-client-utils';

describe('toBrowserSpeechLanguage', () => {
  test('maps ISO 639-1 codes to BCP-47', () => {
    expect(toBrowserSpeechLanguage('zh')).toBe('zh-CN');
    expect(toBrowserSpeechLanguage('en')).toBe('en-US');
    expect(toBrowserSpeechLanguage('ja')).toBe('ja-JP');
  });

  test('passes through existing BCP-47 tags', () => {
    expect(toBrowserSpeechLanguage('zh-TW')).toBe('zh-TW');
    expect(toBrowserSpeechLanguage('en-GB')).toBe('en-GB');
  });

  test('defaults empty to zh-CN', () => {
    expect(toBrowserSpeechLanguage('')).toBe('zh-CN');
    expect(toBrowserSpeechLanguage('auto')).toBe('zh-CN');
  });
});

describe('isServerAsrProviderUsable', () => {
  test('browser-native is never usable as server ASR', () => {
    expect(isServerAsrProviderUsable('browser-native', {})).toBe(false);
  });

  test('whisper with api key is usable', () => {
    expect(
      isServerAsrProviderUsable('openai-whisper', {
        'openai-whisper': { apiKey: 'sk-test' },
      }),
    ).toBe(true);
  });
});

describe('pickServerAsrFallback', () => {
  test('returns null when nothing is configured', () => {
    expect(pickServerAsrFallback({})).toBeNull();
  });

  test('prefers whisper when configured', () => {
    expect(
      pickServerAsrFallback({
        'openai-whisper': { apiKey: 'sk-test' },
        'qwen-asr': { apiKey: 'qwen' },
      }),
    ).toBe('openai-whisper');
  });
});
