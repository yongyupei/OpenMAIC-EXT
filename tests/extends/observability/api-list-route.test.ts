import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GET } from '@/app/extends/api/ai-traces/route';
import { __resetTraceSink } from '@/lib/extends/observability/trace-sink';

let tmpDir = '';

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ai-traces-list-api-'));
  process.env.AI_TRACE_ROOT_DIR = tmpDir;
  __resetTraceSink();
});

afterEach(() => {
  delete process.env.AI_TRACE_ROOT_DIR;
  if (tmpDir && existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

function seedIndex(entries: Array<{ traceId: string; projectId?: string; status?: 'ok'|'error'; kind?: string; startedAt?: string }>) {
  mkdirSync(tmpDir, { recursive: true });
  const lines = entries.map((e) => JSON.stringify({
    traceId: e.traceId,
    kind: e.kind ?? 'chapter-generation',
    status: e.status ?? 'ok',
    startedAt: e.startedAt ?? '2026-05-28T05:00:00.000Z',
    durationMs: 1000,
    context: e.projectId ? { projectId: e.projectId } : {},
    file: `2026-05-28/${e.traceId}.jsonl`,
  }));
  writeFileSync(join(tmpDir, 'index.jsonl'), lines.join('\n') + '\n');
}

function makeRequest(query: string = ''): Request {
  return new Request(`http://localhost/api/extends/ai-traces${query}`);
}

describe('GET /api/extends/ai-traces', () => {
  test('returns empty list when no traces', async () => {
    seedIndex([]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.items).toEqual([]);
    expect(body.data.total).toBe(0);
  });

  test('returns all traces newest first', async () => {
    seedIndex([
      { traceId: 'a', startedAt: '2026-05-27T00:00:00.000Z' },
      { traceId: 'b', startedAt: '2026-05-28T00:00:00.000Z' },
    ]);
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items.map((t: { traceId: string }) => t.traceId)).toEqual(['b', 'a']);
    expect(body.data.total).toBe(2);
  });

  test('filters by projectId', async () => {
    seedIndex([
      { traceId: 'p1', projectId: 'P-1' },
      { traceId: 'p2', projectId: 'P-2' },
    ]);
    const res = await GET(makeRequest('?projectId=P-1'));
    const body = await res.json();
    expect(body.data.items.map((t: { traceId: string }) => t.traceId)).toEqual(['p1']);
  });

  test('filters by status', async () => {
    seedIndex([
      { traceId: 'ok1', status: 'ok' },
      { traceId: 'err1', status: 'error' },
    ]);
    const res = await GET(makeRequest('?status=error'));
    const body = await res.json();
    expect(body.data.items.map((t: { traceId: string }) => t.traceId)).toEqual(['err1']);
  });

  test('rejects invalid status', async () => {
    seedIndex([]);
    const res = await GET(makeRequest('?status=badvalue'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.errorCode).toBe('INVALID_REQUEST');
  });

  test('limit + offset paging', async () => {
    seedIndex([
      { traceId: 'a', startedAt: '2026-05-26T00:00:00.000Z' },
      { traceId: 'b', startedAt: '2026-05-27T00:00:00.000Z' },
      { traceId: 'c', startedAt: '2026-05-28T00:00:00.000Z' },
    ]);
    const res = await GET(makeRequest('?limit=1&offset=1'));
    const body = await res.json();
    // sorted newest first → [c, b, a]; offset=1 limit=1 → [b]
    expect(body.data.items.map((t: { traceId: string }) => t.traceId)).toEqual(['b']);
    expect(body.data.total).toBe(3);
  });

  test('rejects invalid limit', async () => {
    seedIndex([]);
    const res = await GET(makeRequest('?limit=999'));
    expect(res.status).toBe(400);
  });

  test('rejects negative offset', async () => {
    seedIndex([]);
    const res = await GET(makeRequest('?offset=-1'));
    expect(res.status).toBe(400);
  });

  test('filters by search on errorSummary', async () => {
    seedIndex([
      { traceId: 'hit', status: 'error' },
      { traceId: 'miss', status: 'ok' },
    ]);
    writeFileSync(
      join(tmpDir, 'index.jsonl'),
      [
        JSON.stringify({
          traceId: 'hit',
          kind: 'chapter-generation',
          status: 'error',
          startedAt: '2026-05-28T05:00:00.000Z',
          errorSummary: 'AI_RetryError 502',
          context: {},
          file: '2026-05-28/hit.jsonl',
        }),
        JSON.stringify({
          traceId: 'miss',
          kind: 'chapter-generation',
          status: 'ok',
          startedAt: '2026-05-28T04:00:00.000Z',
          context: {},
          file: '2026-05-28/miss.jsonl',
        }),
      ].join('\n') + '\n',
    );
    const res = await GET(makeRequest('?search=AI_RetryError'));
    const body = await res.json();
    expect(body.data.items.map((t: { traceId: string }) => t.traceId)).toEqual(['hit']);
  });
});
