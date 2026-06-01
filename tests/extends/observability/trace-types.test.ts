// tests/extends/observability/trace-types.test.ts
import { describe, expect, test } from 'vitest';
import {
  isTraceStart,
  isSpan,
  isTraceEnd,
  type TraceJsonlRecord,
} from '@/lib/extends/observability/trace-types';

describe('trace JSONL record discriminators', () => {
  test('isTraceStart matches only trace-start records', () => {
    expect(isTraceStart({ _t: 'trace-start' } as unknown as TraceJsonlRecord)).toBe(true);
    expect(isTraceStart({ _t: 'span' } as unknown as TraceJsonlRecord)).toBe(false);
    expect(isTraceStart({ _t: 'trace-end' } as unknown as TraceJsonlRecord)).toBe(false);
  });

  test('isSpan matches only span records', () => {
    expect(isSpan({ _t: 'span' } as unknown as TraceJsonlRecord)).toBe(true);
    expect(isSpan({ _t: 'trace-start' } as unknown as TraceJsonlRecord)).toBe(false);
  });

  test('isTraceEnd matches only trace-end records', () => {
    expect(isTraceEnd({ _t: 'trace-end' } as unknown as TraceJsonlRecord)).toBe(true);
    expect(isTraceEnd({ _t: 'span' } as unknown as TraceJsonlRecord)).toBe(false);
  });
});
