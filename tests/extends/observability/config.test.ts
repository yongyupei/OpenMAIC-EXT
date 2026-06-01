import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { resolveAiTraceConfig } from '@/lib/extends/observability/config';

const original = {
  NODE_ENV: process.env.NODE_ENV,
  AI_TRACE_DETAIL: process.env.AI_TRACE_DETAIL,
  AI_TRACE_RETENTION_DAYS: process.env.AI_TRACE_RETENTION_DAYS,
  AI_TRACE_PROMPT_MAX_CHARS: process.env.AI_TRACE_PROMPT_MAX_CHARS,
};

beforeEach(() => {
  for (const key of Object.keys(original)) delete (process.env as Record<string, unknown>)[key];
});
afterEach(() => {
  for (const [k, v] of Object.entries(original)) {
    if (v === undefined) delete (process.env as Record<string, unknown>)[k];
    else (process.env as Record<string, unknown>)[k] = v;
  }
});

describe('resolveAiTraceConfig', () => {
  test('dev defaults to detail=full', () => {
    process.env.NODE_ENV = 'development';
    expect(resolveAiTraceConfig().detail).toBe('full');
  });

  test('prod defaults to detail=metadata', () => {
    process.env.NODE_ENV = 'production';
    expect(resolveAiTraceConfig().detail).toBe('metadata');
  });

  test('AI_TRACE_DETAIL=off honored regardless of NODE_ENV', () => {
    process.env.NODE_ENV = 'development';
    process.env.AI_TRACE_DETAIL = 'off';
    expect(resolveAiTraceConfig().detail).toBe('off');
  });

  test('retention defaults to 7 days, env overrides', () => {
    expect(resolveAiTraceConfig().retentionDays).toBe(7);
    process.env.AI_TRACE_RETENTION_DAYS = '30';
    expect(resolveAiTraceConfig().retentionDays).toBe(30);
  });

  test('invalid retention falls back to default', () => {
    process.env.AI_TRACE_RETENTION_DAYS = 'foo';
    expect(resolveAiTraceConfig().retentionDays).toBe(7);
  });

  test('promptMaxChars defaults to 50000, env overrides', () => {
    expect(resolveAiTraceConfig().promptMaxChars).toBe(50000);
    process.env.AI_TRACE_PROMPT_MAX_CHARS = '12345';
    expect(resolveAiTraceConfig().promptMaxChars).toBe(12345);
  });
});
