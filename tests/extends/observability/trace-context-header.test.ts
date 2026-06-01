import { describe, expect, test } from 'vitest';

import {
  decodeTraceContextHeader,
  encodeTraceContextHeader,
} from '@/lib/extends/observability/trace-context-header';

describe('trace-context-header', () => {
  test('round-trips unicode titles as ASCII-safe header values', () => {
    const context = {
      sceneOutlineId: 'scene-1',
      userVisibleTitle: 'AI编程概览与学习路径',
    };
    const encoded = encodeTraceContextHeader(context);
    expect(encoded.startsWith('b64:')).toBe(true);
    expect(/^[\x00-\xFF]*$/.test(encoded)).toBe(true);
    expect(decodeTraceContextHeader(encoded)).toEqual(context);
  });

  test('decodes legacy plain JSON headers', () => {
    const legacy = JSON.stringify({ sceneOutlineId: 's1', userVisibleTitle: 'Intro' });
    expect(decodeTraceContextHeader(legacy)).toEqual({
      sceneOutlineId: 's1',
      userVisibleTitle: 'Intro',
    });
  });
});
