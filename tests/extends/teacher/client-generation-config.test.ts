/**
 * @extends-from tests/teacher/client-generation-config.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, test } from 'vitest';
import {
  buildTeacherGenerationHeaders,
  withTeacherThinkingConfig,
} from '@/lib/teacher/client-generation-config';

describe('teacher client generation config', () => {
  test('builds model headers from the current client model config shape', () => {
    expect(
      buildTeacherGenerationHeaders({
        modelString: 'ollama:gemma4:31b',
        apiKey: '',
        baseUrl: 'http://localhost:11434',
        providerType: 'openai',
      }),
    ).toEqual({
      'Content-Type': 'application/json',
      'x-model': 'ollama:gemma4:31b',
      'x-api-key': '',
      'x-base-url': 'http://localhost:11434',
      'x-provider-type': 'openai',
    });
  });

  test('adds thinking config to teacher generation request bodies when enabled', () => {
    expect(
      withTeacherThinkingConfig({ chapterId: 'chapter-1' }, { enabled: true, budgetTokens: 1024 }),
    ).toEqual({
      chapterId: 'chapter-1',
      thinkingConfig: { enabled: true, budgetTokens: 1024 },
    });
  });

  test('leaves request bodies unchanged when thinking config is absent', () => {
    expect(withTeacherThinkingConfig({ chapterId: 'chapter-1' })).toEqual({
      chapterId: 'chapter-1',
    });
  });
});
