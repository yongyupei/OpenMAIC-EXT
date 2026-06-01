import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, existsSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJsonlTraceSink, scheduleAiTraceCleanup } from '@/lib/extends/observability/trace-sink';
import type { SpanRecord, TraceEndRecord, TraceStartRecord } from '@/lib/extends/observability/trace-types';

let tmpDir = '';

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ai-traces-test-'));
});
afterEach(() => {
  if (tmpDir && existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

function makeStart(traceId = 't1', startedAt = '2026-05-28T05:55:00.000Z'): TraceStartRecord {
  return {
    _t: 'trace-start',
    traceId,
    kind: 'chapter-generation',
    context: { projectId: 'p-1' },
    startedAt,
    env: 'test',
  };
}

function makeSpan(traceId = 't1', spanId = 'sp1', status: 'ok' | 'error' = 'ok'): SpanRecord {
  return {
    _t: 'span',
    spanId, traceId, kind: 'workflow-step', name: 'outline',
    attrs: {}, startedAt: '...', endedAt: '...', durationMs: 100, status, events: [],
  };
}

function makeEnd(traceId = 't1', status: 'ok' | 'error' = 'ok'): TraceEndRecord {
  return {
    _t: 'trace-end', traceId, endedAt: '...', durationMs: 1000, status, spanCount: 1,
  };
}

describe('JsonlTraceSink', () => {
  test('writes trace-start to per-trace JSONL file', async () => {
    const sink = createJsonlTraceSink({ rootDir: tmpDir, detail: 'full', promptMaxChars: 1000 });
    sink.writeTraceStart(makeStart('t1'));
    await sink.flush();

    const files = readdirSync(join(tmpDir, '2026-05-28'));
    expect(files).toEqual(['t1.jsonl']);
    const content = readFileSync(join(tmpDir, '2026-05-28/t1.jsonl'), 'utf8');
    expect(JSON.parse(content.trim())._t).toBe('trace-start');
  });

  test('appends span lines after trace-start', async () => {
    const sink = createJsonlTraceSink({ rootDir: tmpDir, detail: 'full', promptMaxChars: 1000 });
    sink.writeTraceStart(makeStart('t1'));
    sink.writeSpan(makeSpan('t1', 'sp1', 'ok'));
    sink.writeSpan(makeSpan('t1', 'sp2', 'ok'));
    await sink.flush();

    const content = readFileSync(join(tmpDir, '2026-05-28/t1.jsonl'), 'utf8');
    const lines = content.trim().split('\n').map((l) => JSON.parse(l));
    expect(lines.map((l) => l._t)).toEqual(['trace-start', 'span', 'span']);
  });

  test('writeTraceEnd appends end line and writes index entry', async () => {
    const sink = createJsonlTraceSink({ rootDir: tmpDir, detail: 'full', promptMaxChars: 1000 });
    sink.writeTraceStart(makeStart('t1'));
    sink.writeSpan(makeSpan('t1', 'sp1', 'ok'));
    sink.writeTraceEnd(makeEnd('t1', 'ok'));
    await sink.flush();

    const content = readFileSync(join(tmpDir, '2026-05-28/t1.jsonl'), 'utf8');
    const lines = content.trim().split('\n');
    expect(JSON.parse(lines[lines.length - 1])._t).toBe('trace-end');

    const index = readFileSync(join(tmpDir, 'index.jsonl'), 'utf8');
    const entry = JSON.parse(index.trim());
    expect(entry.traceId).toBe('t1');
    expect(entry.file).toBe('2026-05-28/t1.jsonl');
  });

  test('detail=metadata strips promptText/responseText on ok spans', async () => {
    const sink = createJsonlTraceSink({ rootDir: tmpDir, detail: 'metadata', promptMaxChars: 1000 });
    sink.writeTraceStart(makeStart('t1'));
    sink.writeSpan({
      ...makeSpan('t1', 'sp1', 'ok'),
      attrs: { promptText: 'big prompt', responseText: 'big response', promptChars: 10 },
    });
    sink.writeTraceEnd(makeEnd('t1', 'ok'));
    await sink.flush();

    const content = readFileSync(join(tmpDir, '2026-05-28/t1.jsonl'), 'utf8');
    const spanLine = content.split('\n').find((l) => l.includes('"_t":"span"'))!;
    const parsed = JSON.parse(spanLine);
    expect(parsed.attrs.promptText).toBeUndefined();
    expect(parsed.attrs.responseText).toBeUndefined();
    expect(parsed.attrs.promptChars).toBe(10);
  });

  test('detail=metadata preserves promptText/responseText on error spans', async () => {
    const sink = createJsonlTraceSink({ rootDir: tmpDir, detail: 'metadata', promptMaxChars: 1000 });
    sink.writeTraceStart(makeStart('t1'));
    sink.writeSpan({
      ...makeSpan('t1', 'sp1', 'error'),
      attrs: { promptText: 'failed prompt' },
      error: { message: 'boom' },
    });
    sink.writeTraceEnd(makeEnd('t1', 'error'));
    await sink.flush();

    const spanLine = readFileSync(join(tmpDir, '2026-05-28/t1.jsonl'), 'utf8')
      .split('\n').find((l) => l.includes('"_t":"span"'))!;
    expect(JSON.parse(spanLine).attrs.promptText).toBe('failed prompt');
  });

  test('detail=full truncates promptText longer than promptMaxChars', async () => {
    const sink = createJsonlTraceSink({ rootDir: tmpDir, detail: 'full', promptMaxChars: 10 });
    sink.writeTraceStart(makeStart('t1'));
    sink.writeSpan({
      ...makeSpan('t1', 'sp1', 'ok'),
      attrs: { promptText: 'a'.repeat(50) },
    });
    sink.writeTraceEnd(makeEnd('t1', 'ok'));
    await sink.flush();

    const spanLine = readFileSync(join(tmpDir, '2026-05-28/t1.jsonl'), 'utf8')
      .split('\n').find((l) => l.includes('"_t":"span"'))!;
    const parsed = JSON.parse(spanLine);
    expect(parsed.attrs.promptText.length).toBeLessThanOrEqual(25);
    expect(parsed.attrs.promptText).toContain('…');
  });

  test('detail=off skips span writes but keeps trace-start/end', async () => {
    const sink = createJsonlTraceSink({ rootDir: tmpDir, detail: 'off', promptMaxChars: 1000 });
    sink.writeTraceStart(makeStart('t1'));
    sink.writeSpan(makeSpan('t1', 'sp1', 'ok'));
    sink.writeTraceEnd(makeEnd('t1', 'ok'));
    await sink.flush();

    const content = readFileSync(join(tmpDir, '2026-05-28/t1.jsonl'), 'utf8');
    expect(content).not.toContain('"_t":"span"');
    expect(content).toContain('"_t":"trace-start"');
    expect(content).toContain('"_t":"trace-end"');
  });

  test('detail=metadata + error span + oversized promptText is still capped by promptMaxChars (memory safety)', async () => {
    const sink = createJsonlTraceSink({ rootDir: tmpDir, detail: 'metadata', promptMaxChars: 20 });
    sink.writeTraceStart(makeStart('t1'));
    sink.writeSpan({
      ...makeSpan('t1', 'sp1', 'error'),
      attrs: { promptText: 'a'.repeat(500), responseText: 'b'.repeat(500) },
      error: { message: 'boom' },
    });
    sink.writeTraceEnd(makeEnd('t1', 'error'));
    await sink.flush();

    const spanLine = readFileSync(join(tmpDir, '2026-05-28/t1.jsonl'), 'utf8')
      .split('\n').find((l) => l.includes('"_t":"span"'))!;
    const parsed = JSON.parse(spanLine);
    // promptText is preserved (not stripped — error scene needs it) but capped at promptMaxChars
    expect(parsed.attrs.promptText).toBeDefined();
    expect(parsed.attrs.promptText.length).toBeLessThanOrEqual(35);
    expect(parsed.attrs.promptText).toContain('…');
    // responseText same rule
    expect(parsed.attrs.responseText.length).toBeLessThanOrEqual(35);
  });
});

describe('scheduleAiTraceCleanup', () => {
  test('deletes date directories older than retentionDays', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    mkdirSync(join(tmpDir, today), { recursive: true });
    mkdirSync(join(tmpDir, old), { recursive: true });
    writeFileSync(join(tmpDir, today, 'fresh.jsonl'), '{}');
    writeFileSync(join(tmpDir, old, 'old.jsonl'), '{}');
    writeFileSync(join(tmpDir, 'index.jsonl'),
      `${JSON.stringify({ traceId: 'fresh', file: `${today}/fresh.jsonl` })}\n` +
      `${JSON.stringify({ traceId: 'old',   file: `${old}/old.jsonl` })}\n`,
    );

    await scheduleAiTraceCleanup({ rootDir: tmpDir, retentionDays: 7 });

    expect(existsSync(join(tmpDir, today))).toBe(true);
    expect(existsSync(join(tmpDir, old))).toBe(false);

    const remainingIndex = readFileSync(join(tmpDir, 'index.jsonl'), 'utf8').trim().split('\n');
    expect(remainingIndex).toHaveLength(1);
    expect(JSON.parse(remainingIndex[0]).traceId).toBe('fresh');
  });

  test('handles missing rootDir gracefully', async () => {
    rmSync(tmpDir, { recursive: true, force: true });
    await expect(
      scheduleAiTraceCleanup({ rootDir: tmpDir, retentionDays: 7 }),
    ).resolves.toBeUndefined();
  });
});
