import { describe, expect, test } from 'vitest';

import {
  buildSceneRedesignTraceHeaders,
  parseFetchApiErrorMessage,
} from '@lib-extends/hooks/scene-fetch-helpers';
import { decodeTraceContextHeader } from '@/lib/extends/observability/trace-context-header';

describe('parseFetchApiErrorMessage', () => {
  test('prefers error over details and message', () => {
    expect(
      parseFetchApiErrorMessage(
        { error: 'Model not configured', details: 'Missing API key', message: 'Bad request' },
        'fallback',
      ),
    ).toBe('Model not configured');
  });

  test('falls back when no string fields exist', () => {
    expect(parseFetchApiErrorMessage({ code: 500 }, 'Request failed')).toBe('Request failed');
  });
});

describe('buildSceneRedesignTraceHeaders', () => {
  test('produces latin1-safe headers for unicode scene titles', () => {
    const headers = buildSceneRedesignTraceHeaders(
      'trace-1',
      'scene-1',
      'AI编程概览与学习路径',
    );

    for (const value of Object.values(headers)) {
      for (let i = 0; i < value.length; i++) {
        expect(value.charCodeAt(i)).toBeLessThanOrEqual(0xff);
      }
    }

    expect(decodeTraceContextHeader(headers['x-ai-trace-context']!)).toEqual({
      sceneOutlineId: 'scene-1',
      userVisibleTitle: 'AI编程概览与学习路径',
    });
  });
});
