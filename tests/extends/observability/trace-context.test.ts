import { beforeEach, describe, expect, test, vi } from 'vitest';
import { aiTraceContext, generateTraceId } from '@/lib/extends/observability/trace-context';
import type { TraceJsonlRecord } from '@/lib/extends/observability/trace-types';

// Capture sink writes via vi.mock so we can inspect what trace-context emits
const sinkCalls: TraceJsonlRecord[] = [];

vi.mock('@/lib/extends/observability/trace-sink', () => ({
  getTraceSink: () => ({
    writeTraceStart: (record: TraceJsonlRecord) => { sinkCalls.push(record); },
    writeSpan: (record: TraceJsonlRecord) => { sinkCalls.push(record); },
    writeTraceEnd: (record: TraceJsonlRecord) => { sinkCalls.push(record); },
  }),
}));

beforeEach(() => {
  sinkCalls.length = 0;
});

describe('aiTraceContext.run', () => {
  test('emits trace-start and trace-end for a successful run', async () => {
    await aiTraceContext.run(
      { kind: 'chapter-generation', context: { projectId: 'p-1' } },
      async () => 'ok',
    );
    expect(sinkCalls[0]._t).toBe('trace-start');
    expect(sinkCalls[sinkCalls.length - 1]._t).toBe('trace-end');
    expect((sinkCalls[sinkCalls.length - 1] as { status: string }).status).toBe('ok');
  });

  test('captures error and re-throws', async () => {
    await expect(
      aiTraceContext.run(
        { kind: 'chapter-generation', context: {} },
        async () => { throw new Error('boom'); },
      ),
    ).rejects.toThrow('boom');
    const end = sinkCalls.find((r) => r._t === 'trace-end') as { status: string; errorSummary?: string };
    expect(end.status).toBe('error');
    expect(end.errorSummary).toContain('boom');
  });

  test('currentTraceId returns the active id inside run', async () => {
    let captured: string | null = null;
    await aiTraceContext.run(
      { kind: 'other', context: {} },
      async () => { captured = aiTraceContext.currentTraceId(); },
    );
    expect(captured).toMatch(/^[A-Za-z0-9_-]{12,}$/);
    expect(aiTraceContext.currentTraceId()).toBeNull(); // outside run
  });
});

describe('aiTraceContext.withSpan', () => {
  test('records span on success', async () => {
    await aiTraceContext.run({ kind: 'other', context: {} }, async () => {
      await aiTraceContext.withSpan(
        { kind: 'workflow-step', name: 'outline' },
        async () => 42,
      );
    });
    const span = sinkCalls.find((r) => r._t === 'span') as { name: string; status: string };
    expect(span.name).toBe('outline');
    expect(span.status).toBe('ok');
  });

  test('records error span and re-throws', async () => {
    await expect(
      aiTraceContext.run({ kind: 'other', context: {} }, async () => {
        await aiTraceContext.withSpan({ kind: 'workflow-step', name: 'scene' }, async () => {
          throw new Error('span-boom');
        });
      }),
    ).rejects.toThrow('span-boom');
    const span = sinkCalls.find((r) => r._t === 'span') as { status: string; error: { message: string } };
    expect(span.status).toBe('error');
    expect(span.error.message).toBe('span-boom');
  });

  test('nested spans set parentSpanId', async () => {
    await aiTraceContext.run({ kind: 'other', context: {} }, async () => {
      await aiTraceContext.withSpan({ kind: 'workflow-step', name: 'outer' }, async () => {
        await aiTraceContext.withSpan({ kind: 'llm-call', name: 'inner' }, async () => {});
      });
    });
    const spans = sinkCalls.filter((r) => r._t === 'span') as Array<{ name: string; parentSpanId?: string; spanId: string }>;
    const outer = spans.find((s) => s.name === 'outer')!;
    const inner = spans.find((s) => s.name === 'inner')!;
    expect(inner.parentSpanId).toBe(outer.spanId);
  });
});

describe('aiTraceContext.withLLMSpan', () => {
  test('auto-extracts usage and assigns llm-call kind', async () => {
    await aiTraceContext.run({ kind: 'chapter-generation', context: {} }, async () => {
      await aiTraceContext.withLLMSpan(
        { source: 'test', modelId: 'mimo-v2.5', providerId: 'xiaomi', promptText: 'hi' },
        async () => ({
          text: 'world',
          usage: { inputTokens: 10, outputTokens: 5 },
        }),
      );
    });
    const span = sinkCalls.find((r) => r._t === 'span') as { kind: string; attrs: { inputTokens?: number; outputTokens?: number; responseChars?: number } };
    expect(span.kind).toBe('llm-call');
    expect(span.attrs.inputTokens).toBe(10);
    expect(span.attrs.outputTokens).toBe(5);
    expect(span.attrs.responseChars).toBe(5);
  });
});

describe('generateTraceId / generateSpanId', () => {
  test('generates url-safe ids of expected length', () => {
    const id = generateTraceId();
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(id.length).toBeGreaterThanOrEqual(12);
  });
});

describe('trace.spanCount accounting', () => {
  test('counts all spans created during the run (including nested)', async () => {
    await aiTraceContext.run({ kind: 'other', context: {} }, async () => {
      await aiTraceContext.withSpan({ kind: 'workflow-step', name: 'outer' }, async () => {
        await aiTraceContext.withSpan({ kind: 'llm-call', name: 'inner1' }, async () => {});
        await aiTraceContext.withSpan({ kind: 'llm-call', name: 'inner2' }, async () => {});
      });
    });
    const end = sinkCalls.find((r) => r._t === 'trace-end') as { spanCount: number };
    expect(end.spanCount).toBe(3);
  });
});

describe('startSpan outside run', () => {
  test('returns a safe noop handle that does not throw', () => {
    const h = aiTraceContext.startSpan({ kind: 'custom', name: 'x' });
    expect(h.spanId).toBe('noop');
    expect(() => h.end()).not.toThrow();
    expect(() => h.end({ status: 'error', error: new Error('y') })).not.toThrow();
    expect(() => h.addEvent({ kind: 'info', message: 'hi' })).not.toThrow();
  });

  test('noop handle does not emit to sink', () => {
    const h = aiTraceContext.startSpan({ kind: 'custom', name: 'x' });
    h.end({ status: 'ok' });
    // noop handle should not invoke sink at all
    expect(sinkCalls.length).toBe(0);
  });
});

describe('SpanHandle.addEvent', () => {
  test('events appear in the finalized span record', async () => {
    await aiTraceContext.run({ kind: 'other', context: {} }, async () => {
      const h = aiTraceContext.startSpan({ kind: 'custom', name: 'x' });
      h.addEvent({ kind: 'info', message: 'hello' });
      h.addEvent({ kind: 'retry', message: 'attempt 2/3', data: { delay: 500 } });
      h.end({ status: 'ok' });
    });
    const span = sinkCalls.find((r) => r._t === 'span') as {
      events: Array<{ kind: string; message: string; at: string; data?: Record<string, unknown> }>;
    };
    expect(span.events).toHaveLength(2);
    expect(span.events[0].message).toBe('hello');
    expect(span.events[0].kind).toBe('info');
    expect(span.events[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO timestamp
    expect(span.events[1].data).toEqual({ delay: 500 });
  });
});
