// lib/extends/observability/trace-types.ts

export type TraceKind =
  | 'chapter-generation'
  | 'chapter-media-generation'
  | 'scene-redesign'
  | 'preview-outline-stream'
  | 'preview-scene-content'
  | 'preview-scene-actions'
  | 'pbl-generation'
  | 'knowledge-base-ai-plan'
  | 'tts'
  | 'asr'
  | 'other';

export type TraceStatus = 'in-progress' | 'ok' | 'error' | 'partial';

export type SpanKind =
  | 'workflow-step'
  | 'llm-call'
  | 'llm-stream'
  | 'media-call'
  | 'tts-call'
  | 'asr-call'
  | 'http-fetch'
  | 'custom';

export type SpanStatus = 'in-progress' | 'ok' | 'error' | 'fallback';

export interface TraceBusinessContext {
  readonly projectId?: string;
  readonly chapterId?: string;
  readonly sceneOutlineId?: string;
  readonly classroomId?: string;
  readonly userVisibleTitle?: string;
  readonly attempt?: 'regenerate' | 'resume' | 'approve' | 'initial';
}

export interface SpanAttrs {
  readonly providerId?: string;
  readonly modelId?: string;
  readonly source?: string;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly thinkingTokens?: number;
  readonly retryAttempts?: number;
  readonly mediaKind?: 'image' | 'video';
  readonly mediaPrompt?: string;
  readonly promptChars?: number;
  readonly responseChars?: number;
  readonly httpStatus?: number;
  readonly promptText?: string;
  readonly responseText?: string;
  readonly httpRequestBody?: unknown;
  readonly httpResponseBody?: unknown;
}

export interface SpanError {
  readonly message: string;
  readonly stack?: string;
  readonly kind?: string;
  readonly httpStatus?: number;
  readonly upstreamBody?: string;
}

export interface SpanEvent {
  readonly at: string;
  readonly kind: 'retry' | 'fallback' | 'progress' | 'partial-output' | 'warn' | 'info';
  readonly message: string;
  readonly data?: Record<string, unknown>;
}

export interface AiSpan {
  readonly spanId: string;
  readonly traceId: string;
  readonly parentSpanId?: string;
  readonly kind: SpanKind;
  readonly name: string;
  readonly attrs: SpanAttrs;
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly durationMs?: number;
  readonly status: SpanStatus;
  readonly error?: SpanError;
  readonly events: SpanEvent[];
}

export interface AiTrace {
  readonly traceId: string;
  readonly kind: TraceKind;
  readonly context: TraceBusinessContext;
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly durationMs?: number;
  readonly status: TraceStatus;
  readonly errorSummary?: string;
  readonly spanCount: number;
  readonly env: 'dev' | 'prod' | 'test';
  readonly appVersion?: string;
}

/** Index sidecar 行结构（脱敏摘要，列表 UI 与 CLI --list 共用） */
export interface TraceIndexEntry {
  readonly traceId: string;
  readonly kind: TraceKind;
  readonly status: TraceStatus;
  readonly startedAt: string;
  readonly durationMs?: number;
  readonly context: TraceBusinessContext;
  readonly errorSummary?: string;
  readonly file: string; // 相对 data/ai-traces/ 的路径
}

/** JSONL 文件首行 */
export interface TraceStartRecord {
  readonly _t: 'trace-start';
  readonly traceId: string;
  readonly kind: TraceKind;
  readonly context: TraceBusinessContext;
  readonly startedAt: string;
  readonly env: 'dev' | 'prod' | 'test';
  readonly appVersion?: string;
}

/** JSONL 文件中间行 */
export interface SpanRecord extends AiSpan {
  readonly _t: 'span';
}

/** JSONL 文件末行 */
export interface TraceEndRecord {
  readonly _t: 'trace-end';
  readonly traceId: string;
  readonly endedAt: string;
  readonly durationMs: number;
  readonly status: TraceStatus;
  readonly errorSummary?: string;
  readonly spanCount: number;
}

export type TraceJsonlRecord = TraceStartRecord | SpanRecord | TraceEndRecord;

export function isTraceStart(r: TraceJsonlRecord): r is TraceStartRecord {
  return r._t === 'trace-start';
}
export function isSpan(r: TraceJsonlRecord): r is SpanRecord {
  return r._t === 'span';
}
export function isTraceEnd(r: TraceJsonlRecord): r is TraceEndRecord {
  return r._t === 'trace-end';
}
