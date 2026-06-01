import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GET } from '@/app/extends/api/ai-traces/[traceId]/route';
import { __resetTraceSink } from '@/lib/extends/observability/trace-sink';

const prevDevUi = process.env.AI_TRACE_DEV_UI;

let tmpDir = '';

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ai-traces-api-'));
  process.env.AI_TRACE_ROOT_DIR = tmpDir;
  process.env.AI_TRACE_DEV_UI = '1';
  __resetTraceSink();
});

afterEach(() => {
  delete process.env.AI_TRACE_ROOT_DIR;
  if (prevDevUi === undefined) delete process.env.AI_TRACE_DEV_UI;
  else process.env.AI_TRACE_DEV_UI = prevDevUi;
  if (tmpDir && existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

function seedTrace(traceId: string) {
  const date = '2026-05-28';
  mkdirSync(join(tmpDir, date), { recursive: true });
  const lines =
    [
      JSON.stringify({
        _t: 'trace-start',
        traceId,
        kind: 'chapter-generation',
        context: { projectId: 'p-1', userVisibleTitle: 'Demo' },
        startedAt: `${date}T05:00:00.000Z`,
        env: 'test',
      }),
      JSON.stringify({
        _t: 'span',
        spanId: 'sp1',
        traceId,
        kind: 'workflow-step',
        name: 'outline',
        attrs: { promptText: 'A'.repeat(500), modelId: 'mimo' },
        startedAt: '...',
        endedAt: '...',
        durationMs: 100,
        status: 'ok',
        events: [],
      }),
      JSON.stringify({
        _t: 'trace-end',
        traceId,
        endedAt: '...',
        durationMs: 1000,
        status: 'ok',
        spanCount: 1,
      }),
    ].join('\n') + '\n';
  writeFileSync(join(tmpDir, date, `${traceId}.jsonl`), lines);
  writeFileSync(
    join(tmpDir, 'index.jsonl'),
    JSON.stringify({
      traceId,
      kind: 'chapter-generation',
      status: 'ok',
      startedAt: `${date}T05:00:00.000Z`,
      durationMs: 1000,
      context: { projectId: 'p-1', userVisibleTitle: 'Demo' },
      file: `${date}/${traceId}.jsonl`,
    }) + '\n',
  );
}

function makeRequest(
  traceId: string,
  view?: string,
): { request: Request; params: Promise<{ traceId: string }> } {
  const url = new URL(
    `http://localhost/api/extends/ai-traces/${traceId}${view ? `?view=${view}` : ''}`,
  );
  return {
    request: new Request(url),
    params: Promise.resolve({ traceId }),
  };
}

describe('GET /api/extends/ai-traces/[traceId]', () => {
  test('returns 200 + redacted trace for valid teacher view', async () => {
    seedTrace('t1');
    const { request, params } = makeRequest('t1', 'teacher');
    const res = await GET(request, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.trace.traceId).toBe('t1');
    expect(body.data.spans).toHaveLength(1);
    // promptText was 500 chars; teacher view truncates to 200 + ellipsis
    expect(body.data.spans[0].attrs.promptText.length).toBeLessThanOrEqual(205);
  });

  test('defaults to teacher view when ?view is omitted', async () => {
    seedTrace('t1');
    const { request, params } = makeRequest('t1');
    const res = await GET(request, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.spans[0].attrs.promptText.length).toBeLessThanOrEqual(205);
  });

  test('returns 404 for missing traceId', async () => {
    const { request, params } = makeRequest('missing', 'teacher');
    const res = await GET(request, { params });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.errorCode).toBe('INVALID_REQUEST');
  });

  test('returns 200 + full prompt for developer view when dev UI enabled', async () => {
    seedTrace('t1');
    const { request, params } = makeRequest('t1', 'developer');
    const res = await GET(request, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.spans[0].attrs.promptText.length).toBe(500);
  });

  test('returns 403 for developer view when dev UI disabled', async () => {
    process.env.AI_TRACE_DEV_UI = '0';
    process.env.NODE_ENV = 'production';
    seedTrace('t1');
    const { request, params } = makeRequest('t1', 'developer');
    const res = await GET(request, { params });
    expect(res.status).toBe(403);
  });

  test('rejects non-string view values gracefully', async () => {
    seedTrace('t1');
    const { request, params } = makeRequest('t1', 'malicious');
    const res = await GET(request, { params });
    expect(res.status).toBe(400);
  });
});
