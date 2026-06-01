// lib/extends/observability/trace-sink.ts
import { appendFileSync, fsyncSync, mkdirSync, openSync, closeSync, existsSync, readdirSync, rmSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type {
  SpanRecord,
  TraceEndRecord,
  TraceIndexEntry,
  TraceJsonlRecord,
  TraceStartRecord,
} from './trace-types';
import { resolveAiTraceConfig, type AiTraceDetailLevel } from './config';

export interface TraceSink {
  writeTraceStart(record: TraceStartRecord): void;
  writeSpan(record: SpanRecord): void;
  writeTraceEnd(record: TraceEndRecord): void;
  flush(): Promise<void>;
}

export interface TraceSinkOptions {
  readonly rootDir: string;
  readonly detail: AiTraceDetailLevel;
  readonly promptMaxChars: number;
}

interface TraceFileInfo {
  readonly path: string;
  readonly relative: string;
  readonly startedAt: string;
  readonly kind: TraceStartRecord['kind'];
  readonly context: TraceStartRecord['context'];
}

let singletonSink: TraceSink | null = null;

export function getTraceSink(): TraceSink {
  if (singletonSink) return singletonSink;
  const cfg = resolveAiTraceConfig();
  singletonSink = createJsonlTraceSink({
    rootDir: process.env.AI_TRACE_ROOT_DIR ?? 'data/ai-traces',
    detail: cfg.detail,
    promptMaxChars: cfg.promptMaxChars,
  });
  return singletonSink;
}

/** Reset cached singleton — test use only. */
export function __resetTraceSink(): void {
  singletonSink = null;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…(truncated)`;
}

/**
 * Detail-level redaction at write time.
 *
 * - `off`         : caller should skip writeSpan entirely; defensive passthrough here.
 * - `full`        : keep all fields; truncate `promptText`/`responseText` if they exceed
 *                   `promptMaxChars` (single-trace files cannot grow unbounded).
 * - `metadata` + ok span    : strip text fields (promptText/responseText/httpRequestBody/
 *                             httpResponseBody) but keep metadata (promptChars/responseChars/
 *                             tokens/latency).
 * - `metadata` + error span : preserve all fields so the error scene survives, but STILL
 *                             enforce the `promptMaxChars` cap — runaway prompts could
 *                             otherwise produce multi-MB single-trace JSONL files even
 *                             in production. The cap is a memory/disk safety invariant
 *                             that applies regardless of detail level.
 */
function redactSpan(span: SpanRecord, detail: AiTraceDetailLevel, promptMaxChars: number): SpanRecord {
  const isError = span.status === 'error';

  if (detail === 'full' || isError) {
    const attrs = { ...span.attrs };
    if (typeof attrs.promptText === 'string' && attrs.promptText.length > promptMaxChars) {
      attrs.promptText = truncate(attrs.promptText, promptMaxChars);
    }
    if (typeof attrs.responseText === 'string' && attrs.responseText.length > promptMaxChars) {
      attrs.responseText = truncate(attrs.responseText, promptMaxChars);
    }
    return { ...span, attrs };
  }

  // detail=metadata + ok span: strip large text fields
  const attrs = { ...span.attrs };
  delete (attrs as Record<string, unknown>).promptText;
  delete (attrs as Record<string, unknown>).responseText;
  delete (attrs as Record<string, unknown>).httpRequestBody;
  delete (attrs as Record<string, unknown>).httpResponseBody;
  return { ...span, attrs };
}

function appendLine(filePath: string, record: TraceJsonlRecord, fsync: boolean): void {
  const line = `${JSON.stringify(record)}\n`;
  if (fsync) {
    const fd = openSync(filePath, 'a');
    try {
      appendFileSync(fd, line);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  } else {
    appendFileSync(filePath, line);
  }
}

export function createJsonlTraceSink(options: TraceSinkOptions): TraceSink {
  const { rootDir, detail, promptMaxChars } = options;
  const files = new Map<string, TraceFileInfo>();
  let pending: Promise<void> = Promise.resolve();

  function enqueue(work: () => void): void {
    pending = pending.then(() => {
      try {
        work();
      } catch (err) {
        console.warn('[ai-trace sink]', err);
      }
    });
  }

  function ensureFile(
    traceId: string,
    startedAt: string,
    kind: TraceStartRecord['kind'],
    context: TraceStartRecord['context'],
  ): TraceFileInfo {
    const cached = files.get(traceId);
    if (cached) return cached;
    const date = startedAt.slice(0, 10); // YYYY-MM-DD
    const relative = `${date}/${traceId}.jsonl`;
    const fullPath = join(rootDir, relative);
    mkdirSync(dirname(fullPath), { recursive: true });
    const info: TraceFileInfo = { path: fullPath, relative, startedAt, kind, context };
    files.set(traceId, info);
    return info;
  }

  function writeIndexEntry(entry: TraceIndexEntry): void {
    const indexPath = join(rootDir, 'index.jsonl');
    mkdirSync(rootDir, { recursive: true });
    // fsync index append to match trace-end durability — otherwise a crash between
    // trace-end fsync and index append would leave the trace file on disk but
    // invisible to readers (list UI / CLI / reader).
    const fd = openSync(indexPath, 'a');
    try {
      appendFileSync(fd, `${JSON.stringify(entry)}\n`);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  }

  return {
    writeTraceStart(record: TraceStartRecord): void {
      enqueue(() => {
        const info = ensureFile(record.traceId, record.startedAt, record.kind, record.context);
        appendLine(info.path, record, false);
      });
    },

    writeSpan(record: SpanRecord): void {
      enqueue(() => {
        if (detail === 'off') return;
        const info = files.get(record.traceId);
        if (!info) {
          console.warn('[ai-trace sink] writeSpan called before writeTraceStart for', record.traceId);
          return;
        }
        const redacted = redactSpan(record, detail, promptMaxChars);
        appendLine(info.path, redacted, record.status === 'error');
      });
    },

    writeTraceEnd(record: TraceEndRecord): void {
      enqueue(() => {
        const info = files.get(record.traceId);
        if (!info) return;
        appendLine(info.path, record, true);
        writeIndexEntry({
          traceId: record.traceId,
          kind: info.kind,
          status: record.status,
          startedAt: info.startedAt,
          durationMs: record.durationMs,
          context: info.context,
          errorSummary: record.errorSummary,
          file: info.relative,
        });
        files.delete(record.traceId);
      });
    },

    async flush(): Promise<void> {
      await pending;
    },
  };
}

export interface CleanupOptions {
  readonly rootDir: string;
  readonly retentionDays: number;
}

function isDateDir(name: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(name);
}

export async function scheduleAiTraceCleanup(opts: CleanupOptions): Promise<void> {
  const { rootDir, retentionDays } = opts;
  if (!existsSync(rootDir)) return;
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const entries = readdirSync(rootDir, { withFileTypes: true });

  const deletedDates = new Set<string>();
  for (const entry of entries) {
    if (!entry.isDirectory() || !isDateDir(entry.name)) continue;
    const dirDate = Date.parse(`${entry.name}T00:00:00.000Z`);
    if (!Number.isFinite(dirDate) || dirDate >= cutoff) continue;
    const dirPath = join(rootDir, entry.name);
    try {
      rmSync(dirPath, { recursive: true, force: true });
      deletedDates.add(entry.name);
    } catch (err) {
      console.warn('[ai-trace cleanup] failed to remove', dirPath, err);
    }
  }

  if (deletedDates.size === 0) return;

  const indexPath = join(rootDir, 'index.jsonl');
  if (!existsSync(indexPath)) return;
  const lines = readFileSync(indexPath, 'utf8').split('\n').filter((l) => l.trim().length > 0);
  const keep = lines.filter((line) => {
    try {
      const entry = JSON.parse(line) as { file?: string };
      const date = entry.file?.split('/')[0] ?? '';
      return !deletedDates.has(date);
    } catch { return false; }
  });
  // pid-suffixed tmp to avoid multi-process collision; writeFileSync truncates so
  // a stale leftover from a previous crash cannot pollute the new content;
  // renameSync atomically replaces the target on POSIX and Win32 (no rm needed).
  const tmpPath = `${indexPath}.${process.pid}.tmp`;
  const content = keep.length > 0 ? keep.join('\n') + '\n' : '';
  writeFileSync(tmpPath, content);
  renameSync(tmpPath, indexPath);
}
