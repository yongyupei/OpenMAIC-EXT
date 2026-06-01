// tests/extends/observability/e2e-trace-roundtrip.test.ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { __resetTraceSink } from '@/lib/extends/observability/trace-sink';
import { aiTraceContext } from '@/lib/extends/observability/trace-context';
import { createJsonlTraceReader } from '@/lib/extends/observability/trace-reader';

let tmpDir = '';

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ai-traces-e2e-'));
  process.env.AI_TRACE_ROOT_DIR = tmpDir;
  process.env.AI_TRACE_DETAIL = 'full';
  __resetTraceSink();
});
afterEach(() => {
  delete process.env.AI_TRACE_ROOT_DIR;
  delete process.env.AI_TRACE_DETAIL;
  if (tmpDir && existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

describe('end-to-end trace round trip', () => {
  test('run → 2 spans → file written → reader sees trace + spans', async () => {
    let capturedTraceId: string | null = null;

    await aiTraceContext.run(
      {
        kind: 'chapter-generation',
        context: { projectId: 'P-e2e', chapterId: 'C-e2e', userVisibleTitle: 'E2E Test' },
      },
      async () => {
        capturedTraceId = aiTraceContext.currentTraceId();
        await aiTraceContext.withSpan(
          { kind: 'workflow-step', name: 'outline' },
          async () => {
            await aiTraceContext.withLLMSpan(
              { source: 'e2e', modelId: 'mock-model', providerId: 'mock-provider', promptText: 'prompt' },
              async () => ({ text: 'response', usage: { inputTokens: 10, outputTokens: 20 } }),
            );
          },
        );
        await aiTraceContext.withSpan(
          { kind: 'workflow-step', name: 'scene-content[1]' },
          async () => undefined,
        );
      },
    );

    expect(capturedTraceId).toBeTruthy();

    // flush is async; await a tick
    await new Promise((r) => setTimeout(r, 50));

    const reader = createJsonlTraceReader({ rootDir: tmpDir });
    const detail = await reader.readTrace(capturedTraceId!, { view: 'developer' });
    expect(detail).not.toBeNull();
    expect(detail!.trace.kind).toBe('chapter-generation');
    expect(detail!.trace.context.userVisibleTitle).toBe('E2E Test');
    expect(detail!.trace.status).toBe('ok');
    // Expect: outline (workflow), llm-call (nested), scene-content[1] (workflow) = 3 spans
    expect(detail!.spans).toHaveLength(3);
    const llmSpan = detail!.spans.find((s) => s.kind === 'llm-call');
    expect(llmSpan?.attrs.inputTokens).toBe(10);
    expect(llmSpan?.attrs.outputTokens).toBe(20);
  });

  test('error path persists span error and re-throws', async () => {
    let traceId: string | null = null;
    await expect(
      aiTraceContext.run(
        { kind: 'chapter-generation', context: { projectId: 'P', chapterId: 'C' } },
        async () => {
          traceId = aiTraceContext.currentTraceId();
          await aiTraceContext.withSpan(
            { kind: 'workflow-step', name: 'outline' },
            async () => { throw new Error('LLM 502'); },
          );
        },
      ),
    ).rejects.toThrow('LLM 502');

    await new Promise((r) => setTimeout(r, 50));
    const reader = createJsonlTraceReader({ rootDir: tmpDir });
    const detail = await reader.readTrace(traceId!, { view: 'developer' });
    expect(detail!.trace.status).toBe('error');
    expect(detail!.spans[0].status).toBe('error');
    expect(detail!.spans[0].error?.message).toBe('LLM 502');
  });
});
