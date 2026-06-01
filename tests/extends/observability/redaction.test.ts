// tests/extends/observability/redaction.test.ts
import { describe, expect, test } from 'vitest';
import { redactSpanForTeacher } from '@/lib/extends/observability/redaction';
import type { AiSpan } from '@/lib/extends/observability/trace-types';

function makeSpan(overrides: Partial<AiSpan>): AiSpan {
  return {
    spanId: 'sp1',
    traceId: 't1',
    kind: 'workflow-step',
    name: 'n',
    attrs: {},
    startedAt: 's',
    status: 'ok',
    events: [],
    ...overrides,
  };
}

describe('redactSpanForTeacher', () => {
  test('truncates promptText to 200 chars', () => {
    const span = makeSpan({ attrs: { promptText: 'a'.repeat(500) } });
    const out = redactSpanForTeacher(span);
    expect(out.attrs.promptText?.length).toBeLessThanOrEqual(205);
    expect(out.attrs.promptText).toContain('…');
  });

  test('truncates responseText to 200 chars', () => {
    const span = makeSpan({ attrs: { responseText: 'b'.repeat(500) } });
    const out = redactSpanForTeacher(span);
    expect(out.attrs.responseText?.length).toBeLessThanOrEqual(205);
    expect(out.attrs.responseText).toContain('…');
  });

  test('drops httpRequestBody entirely', () => {
    const span = makeSpan({ attrs: { httpRequestBody: { secret: 'x' } } });
    const out = redactSpanForTeacher(span);
    expect(out.attrs.httpRequestBody).toBeUndefined();
  });

  test('truncates httpResponseBody to 400 chars (stringified)', () => {
    const span = makeSpan({ attrs: { httpResponseBody: { data: 'z'.repeat(1000) } } });
    const out = redactSpanForTeacher(span);
    const body = out.attrs.httpResponseBody as string;
    expect(typeof body).toBe('string');
    expect(body.length).toBeLessThanOrEqual(405);
  });

  test('removes error.stack', () => {
    const span = makeSpan({ error: { message: 'oops', stack: 'at /secret/path:1' } });
    const out = redactSpanForTeacher(span);
    expect(out.error?.message).toBe('oops');
    expect(out.error?.stack).toBeUndefined();
  });

  test('truncates error.upstreamBody to 400 chars', () => {
    const span = makeSpan({ error: { message: 'm', upstreamBody: 'u'.repeat(1000) } });
    const out = redactSpanForTeacher(span);
    expect(out.error?.upstreamBody?.length).toBeLessThanOrEqual(405);
  });

  test('preserves metadata fields (model/usage/latency)', () => {
    const span = makeSpan({
      attrs: {
        modelId: 'mimo',
        providerId: 'xiaomi',
        inputTokens: 100,
        outputTokens: 50,
        promptChars: 200,
      },
      durationMs: 1234,
    });
    const out = redactSpanForTeacher(span);
    expect(out.attrs.modelId).toBe('mimo');
    expect(out.attrs.inputTokens).toBe(100);
    expect(out.durationMs).toBe(1234);
  });
});
