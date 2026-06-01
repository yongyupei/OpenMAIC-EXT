import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJsonlTraceReader } from '@/lib/extends/observability/trace-reader';

let tmpDir = '';

beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), 'ai-traces-reader-')); });
afterEach(() => { if (tmpDir && existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true }); });

function seedTrace(traceId: string, date = '2026-05-28', status: 'ok' | 'error' = 'ok') {
  const dateDir = join(tmpDir, date);
  mkdirSync(dateDir, { recursive: true });
  const lines = [
    JSON.stringify({ _t: 'trace-start', traceId, kind: 'chapter-generation', context: { projectId: 'p-1' }, startedAt: `${date}T00:00:00.000Z`, env: 'test' }),
    JSON.stringify({ _t: 'span', spanId: 'sp1', traceId, kind: 'workflow-step', name: 'outline', attrs: { promptText: 'long text', responseText: 'response' }, startedAt: '...', endedAt: '...', durationMs: 100, status: 'ok', events: [] }),
    JSON.stringify({ _t: 'trace-end', traceId, endedAt: '...', durationMs: 1000, status, spanCount: 1, errorSummary: status === 'error' ? 'failed' : undefined }),
  ].join('\n') + '\n';
  writeFileSync(join(dateDir, `${traceId}.jsonl`), lines);
  const indexEntry = { traceId, kind: 'chapter-generation', status, startedAt: `${date}T00:00:00.000Z`, durationMs: 1000, context: { projectId: 'p-1' }, errorSummary: status === 'error' ? 'failed' : undefined, file: `${date}/${traceId}.jsonl` };
  writeFileSync(join(tmpDir, 'index.jsonl'), JSON.stringify(indexEntry) + '\n', { flag: 'a' });
}

describe('JsonlTraceReader', () => {
  test('listTraces returns newest first', async () => {
    seedTrace('older', '2026-05-27');
    seedTrace('newer', '2026-05-28');
    const reader = createJsonlTraceReader({ rootDir: tmpDir });
    const list = await reader.listTraces({});
    expect(list[0].traceId).toBe('newer');
    expect(list[1].traceId).toBe('older');
  });

  test('listTraces filters by status', async () => {
    seedTrace('ok-trace', '2026-05-28', 'ok');
    seedTrace('err-trace', '2026-05-28', 'error');
    const reader = createJsonlTraceReader({ rootDir: tmpDir });
    const errors = await reader.listTraces({ status: 'error' });
    expect(errors.map((t) => t.traceId)).toEqual(['err-trace']);
  });

  test('listTraces filters by projectId', async () => {
    seedTrace('p1', '2026-05-28');
    writeFileSync(
      join(tmpDir, 'index.jsonl'),
      JSON.stringify({ traceId: 'p2', kind: 'chapter-generation', status: 'ok', startedAt: '2026-05-28T00:00:00.000Z', durationMs: 1, context: { projectId: 'OTHER' }, file: '2026-05-28/p2.jsonl' }) + '\n',
      { flag: 'a' },
    );
    const reader = createJsonlTraceReader({ rootDir: tmpDir });
    const filtered = await reader.listTraces({ projectId: 'p-1' });
    expect(filtered.map((t) => t.traceId)).toEqual(['p1']);
  });

  test('readTrace returns parsed trace + spans (developer view)', async () => {
    seedTrace('t1');
    const reader = createJsonlTraceReader({ rootDir: tmpDir });
    const trace = await reader.readTrace('t1', { view: 'developer' });
    expect(trace?.trace.traceId).toBe('t1');
    expect(trace?.spans).toHaveLength(1);
    expect(trace?.spans[0].attrs.promptText).toBe('long text');
  });

  test('readTrace returns null for missing traceId', async () => {
    const reader = createJsonlTraceReader({ rootDir: tmpDir });
    const trace = await reader.readTrace('missing', { view: 'developer' });
    expect(trace).toBeNull();
  });

  test('readTrace with view=teacher truncates promptText', async () => {
    seedTrace('t1');
    const reader = createJsonlTraceReader({ rootDir: tmpDir });
    const trace = await reader.readTrace('t1', { view: 'teacher' });
    expect(trace?.spans[0].error?.stack).toBeUndefined();
  });

  test('listTraces tolerates missing context when filtering by projectId', async () => {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(
      join(tmpDir, 'index.jsonl'),
      `${JSON.stringify({
        traceId: 'no-ctx',
        kind: 'chapter-generation',
        status: 'ok',
        startedAt: '2026-05-28T05:00:00.000Z',
        file: '2026-05-28/no-ctx.jsonl',
      })}\n`,
    );
    const reader = createJsonlTraceReader({ rootDir: tmpDir });
    await expect(reader.listTraces({ projectId: 'p1' })).resolves.toEqual([]);
  });
});
