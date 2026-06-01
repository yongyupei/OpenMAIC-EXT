import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GET } from '@/app/extends/api/ai-traces/[traceId]/raw/route';

let tmpDir = '';
const prevDevUi = process.env.AI_TRACE_DEV_UI;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ai-traces-raw-'));
  process.env.AI_TRACE_ROOT_DIR = tmpDir;
  process.env.AI_TRACE_DEV_UI = '1';
});

afterEach(() => {
  delete process.env.AI_TRACE_ROOT_DIR;
  if (prevDevUi === undefined) delete process.env.AI_TRACE_DEV_UI;
  else process.env.AI_TRACE_DEV_UI = prevDevUi;
  if (tmpDir && existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

function seed(traceId: string, content: string) {
  const date = '2026-05-28';
  mkdirSync(join(tmpDir, date), { recursive: true });
  writeFileSync(join(tmpDir, date, `${traceId}.jsonl`), content);
  writeFileSync(
    join(tmpDir, 'index.jsonl'),
    JSON.stringify({
      traceId,
      kind: 'chapter-generation',
      status: 'ok',
      startedAt: `${date}T05:00:00.000Z`,
      context: {},
      file: `${date}/${traceId}.jsonl`,
    }) + '\n',
  );
}

describe('GET /api/extends/ai-traces/[traceId]/raw', () => {
  test('returns jsonl body when enabled', async () => {
    seed('raw-1', '{"_t":"trace-start"}\n');
    const res = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ traceId: 'raw-1' }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/x-ndjson');
    const text = await res.text();
    expect(text).toContain('trace-start');
  });

  test('returns 403 when dev UI disabled', async () => {
    process.env.AI_TRACE_DEV_UI = '0';
    process.env.NODE_ENV = 'production';
    seed('raw-2', '{}');
    const res = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ traceId: 'raw-2' }),
    });
    expect(res.status).toBe(403);
  });
});
