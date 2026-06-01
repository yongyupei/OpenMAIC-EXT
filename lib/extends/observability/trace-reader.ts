// lib/extends/observability/trace-reader.ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  AiSpan,
  AiTrace,
  SpanRecord,
  TraceEndRecord,
  TraceIndexEntry,
  TraceJsonlRecord,
  TraceKind,
  TraceStartRecord,
  TraceStatus,
} from './trace-types';
import { isSpan, isTraceEnd, isTraceStart } from './trace-types';
import { redactSpanForTeacher } from './redaction';

export interface TraceListFilter {
  readonly kind?: TraceKind;
  readonly status?: TraceStatus;
  readonly projectId?: string;
  readonly chapterId?: string;
  readonly sinceMs?: number;
  readonly search?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface TraceDetailView {
  readonly trace: AiTrace;
  readonly spans: AiSpan[];
  readonly status: AiTrace['status'];
}

export interface TraceReader {
  listTraces(filter: TraceListFilter): Promise<TraceIndexEntry[]>;
  readTrace(traceId: string, opts: { view: 'teacher' | 'developer' }): Promise<TraceDetailView | null>;
}

export interface TraceReaderOptions {
  readonly rootDir: string;
}

function parseIndex(rootDir: string): TraceIndexEntry[] {
  const indexPath = join(rootDir, 'index.jsonl');
  if (!existsSync(indexPath)) return [];
  const content = readFileSync(indexPath, 'utf8');
  return content
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      try {
        return JSON.parse(line) as TraceIndexEntry;
      } catch {
        return null;
      }
    })
    .filter((entry): entry is TraceIndexEntry => entry !== null);
}

/**
 * AND filter. Each predicate skips when the corresponding field is absent.
 *
 * `search` matches against `errorSummary` only (per spec §7.4 CLI behavior:
 * "跨 trace grep error message"). Successful traces have no errorSummary
 * and will not match any search query — this is intentional. Future
 * expansion to `traceId` / `kind` would change the search semantic from
 * "find failures by message" to "free text", which the spec deliberately
 * avoids.
 */
function matchesFilter(entry: TraceIndexEntry, filter: TraceListFilter): boolean {
  const context = entry.context ?? {};
  if (filter.kind && entry.kind !== filter.kind) return false;
  if (filter.status && entry.status !== filter.status) return false;
  if (filter.projectId && context.projectId !== filter.projectId) return false;
  if (filter.chapterId && context.chapterId !== filter.chapterId) return false;
  if (filter.sinceMs && Date.parse(entry.startedAt) < filter.sinceMs) return false;
  if (filter.search && !(entry.errorSummary ?? '').toLowerCase().includes(filter.search.toLowerCase())) return false;
  return true;
}

/**
 * Read-only access to persisted ai-trace JSONL files.
 *
 * **Synchronous I/O by design.** All reads use `readFileSync` rather than
 * `fs/promises`. The reader is consumed exclusively by:
 *   - low-frequency admin/dev surfaces (`/dev/ai-traces` list page, CLI inspect)
 *   - on-demand failure diagnostic dialogs (teacher UI, opened per click)
 *
 * Async fs would require migrating the rest of the existing fork storage layer
 * (`lib/extends/teacher/course-project-storage.ts` etc.) to be consistent,
 * which is well outside this feature's scope. If reader is ever hot-pathed
 * (e.g. real-time tail), revisit.
 */
/** Resolves on-disk JSONL path for a trace id, or null if missing. */
export function resolveTraceFilePath(options: TraceReaderOptions, traceId: string): string | null {
  const entry = parseIndex(options.rootDir).find((e) => e.traceId === traceId);
  if (!entry) return null;
  const filePath = join(options.rootDir, entry.file);
  return existsSync(filePath) ? filePath : null;
}

export function createJsonlTraceReader(options: TraceReaderOptions): TraceReader {
  const { rootDir } = options;

  return {
    async listTraces(filter: TraceListFilter): Promise<TraceIndexEntry[]> {
      const all = parseIndex(rootDir);
      const matched = all.filter((e) => matchesFilter(e, filter));
      matched.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
      const offset = filter.offset ?? 0;
      const limit = filter.limit ?? 50;
      return matched.slice(offset, offset + limit);
    },

    async readTrace(traceId, { view }): Promise<TraceDetailView | null> {
      const index = parseIndex(rootDir);
      const entry = index.find((e) => e.traceId === traceId);
      if (!entry) return null;

      const filePath = join(rootDir, entry.file);
      if (!existsSync(filePath)) return null;

      const lines = readFileSync(filePath, 'utf8')
        .split('\n')
        .filter((l) => l.trim().length > 0);

      let start: TraceStartRecord | null = null;
      let end: TraceEndRecord | null = null;
      const spans: AiSpan[] = [];

      for (const line of lines) {
        let parsed: TraceJsonlRecord;
        try {
          parsed = JSON.parse(line) as TraceJsonlRecord;
        } catch {
          continue;
        }
        if (isTraceStart(parsed)) {
          start = parsed;
        } else if (isSpan(parsed)) {
          const { _t: _, ...span } = parsed as SpanRecord;
          spans.push(view === 'teacher' ? redactSpanForTeacher(span) : span);
        } else if (isTraceEnd(parsed)) {
          end = parsed;
        }
      }

      if (!start) return null;

      const trace: AiTrace = {
        traceId: start.traceId,
        kind: start.kind,
        context: start.context,
        startedAt: start.startedAt,
        endedAt: end?.endedAt,
        durationMs: end?.durationMs,
        status: end?.status ?? 'in-progress',
        errorSummary: end?.errorSummary,
        spanCount: end?.spanCount ?? spans.length,
        env: start.env,
        appVersion: start.appVersion,
      };

      return { trace, spans, status: trace.status };
    },
  };
}
