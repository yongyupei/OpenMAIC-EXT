import { beforeEach, describe, expect, test, vi } from 'vitest';
import { aiTraceContext } from '@/lib/extends/observability/trace-context';

// Mock the UPSTREAM lib/ai/llm.ts by relative path to bypass the fork alias.
// `@/lib/ai/llm` → fork (tsconfig path); relative path hits the real upstream file
// that both this mock and the fork's own `import '../../ai/llm'` resolve to.
const upstreamCallLLM = vi.fn();
vi.mock('../../../lib/ai/llm', async () => {
  return {
    callLLM: upstreamCallLLM,
    streamLLM: vi.fn(),
  };
});

const { callLLM: forkedCallLLM } = await import('@/lib/extends/ai/llm');

beforeEach(() => {
  upstreamCallLLM.mockReset();
});

describe('forked callLLM', () => {
  test('passes through to upstream and returns result', async () => {
    upstreamCallLLM.mockResolvedValueOnce({ text: 'hello', usage: { inputTokens: 10, outputTokens: 5 } });
    const params = { model: { modelId: 'mimo-v2.5-pro', provider: 'xiaomi' }, system: 'sys', prompt: 'usr' };
    const result = await aiTraceContext.run(
      { kind: 'chapter-generation', context: {} },
      () => forkedCallLLM(params as never, 'test-source'),
    );
    expect(result).toEqual({ text: 'hello', usage: { inputTokens: 10, outputTokens: 5 } });
    expect(upstreamCallLLM).toHaveBeenCalledOnce();
    expect(upstreamCallLLM).toHaveBeenCalledWith(params, 'test-source', undefined, undefined);
  });

  test('emits llm-call span with model+source+usage attrs', async () => {
    const sinkSpans: unknown[] = [];
    vi.doMock('@/lib/extends/observability/trace-sink', () => ({
      getTraceSink: () => ({
        writeTraceStart: () => undefined,
        writeSpan: (r: unknown) => sinkSpans.push(r),
        writeTraceEnd: () => undefined,
      }),
    }));
    vi.resetModules();
    const { aiTraceContext: ctx } = await import('@/lib/extends/observability/trace-context');
    const { callLLM: cl } = await import('@/lib/extends/ai/llm');
    const upstream = await import('../../../lib/ai/llm');
    (upstream.callLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ text: 'reply', usage: { inputTokens: 100, outputTokens: 200 } });

    await ctx.run({ kind: 'chapter-generation', context: {} }, async () => {
      await cl(
        { model: { modelId: 'mimo-v2.5-pro', provider: 'xiaomi' }, system: 'sys', prompt: 'user prompt here' } as never,
        'src',
      );
    });
    const span = sinkSpans.find((s) => (s as { kind: string }).kind === 'llm-call') as { name: string; attrs: { modelId: string; source: string; inputTokens: number } };
    expect(span.name).toContain('mimo-v2.5-pro');
    expect(span.attrs.source).toBe('src');
    expect(span.attrs.modelId).toBe('mimo-v2.5-pro');
    expect(span.attrs.inputTokens).toBe(100);
  });

  test('span carries status=error and re-throws on failure', async () => {
    upstreamCallLLM.mockRejectedValueOnce(new Error('boom'));
    await expect(
      aiTraceContext.run({ kind: 'chapter-generation', context: {} }, () =>
        forkedCallLLM({ model: { modelId: 'm', provider: 'p' }, prompt: 'p' } as never, 'src'),
      ),
    ).rejects.toThrow('boom');
  });
});
