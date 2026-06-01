// lib/extends/observability/trace-context.ts
import { AsyncLocalStorage } from 'node:async_hooks';
import { getTraceSink } from './trace-sink';
import { resolveAiTraceConfig } from './config';
import { generateTraceId as newTraceId, generateSpanId as newSpanId, generateClientTraceId } from './trace-ids';
import type {
  AiSpan,
  AiTrace,
  SpanAttrs,
  SpanEvent,
  SpanKind,
  TraceBusinessContext,
  TraceKind,
} from './trace-types';

const consoleWarn = (...args: unknown[]) => console.warn('[ai-trace]', ...args);

export interface RunTraceOptions {
  readonly kind: TraceKind;
  readonly context: TraceBusinessContext;
  readonly inherit?: { traceId: string };
}

export interface WithSpanOptions {
  readonly kind: SpanKind;
  readonly name: string;
  readonly attrs?: SpanAttrs;
}

export interface SpanHandle {
  readonly spanId: string;
  end(result?: { status?: 'ok' | 'error' | 'fallback'; error?: unknown; attrs?: SpanAttrs }): void;
  addEvent(event: Omit<SpanEvent, 'at'>): void;
}

interface TraceFrame {
  readonly trace: AiTrace;
  readonly spanStack: AiSpan[];
  spanCount: number;
}

const storage = new AsyncLocalStorage<TraceFrame>();

export { generateClientTraceId };
export function generateTraceId(): string {
  return newTraceId();
}

export function generateSpanId(): string {
  return newSpanId();
}

function summarizeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try { return JSON.stringify(err); } catch { return String(err); }
}

function buildSpan(opts: WithSpanOptions, traceId: string, parentSpanId?: string): AiSpan {
  return {
    spanId: generateSpanId(),
    traceId,
    parentSpanId,
    kind: opts.kind,
    name: opts.name,
    attrs: { ...(opts.attrs ?? {}) },
    startedAt: new Date().toISOString(),
    status: 'in-progress',
    events: [],
  };
}

function finalizeSpan(
  span: AiSpan,
  result: { status?: 'ok' | 'error' | 'fallback'; error?: unknown; attrs?: SpanAttrs } | undefined,
): AiSpan {
  const endedAt = new Date().toISOString();
  const durationMs = Date.parse(endedAt) - Date.parse(span.startedAt);
  const status = result?.error ? 'error' : (result?.status ?? 'ok');
  const errorObj = result?.error
    ? {
        message: summarizeError(result.error),
        stack: result.error instanceof Error ? result.error.stack : undefined,
        kind: result.error instanceof Error ? result.error.name : undefined,
      }
    : undefined;
  return {
    ...span,
    endedAt,
    durationMs,
    status,
    error: errorObj,
    attrs: { ...span.attrs, ...(result?.attrs ?? {}) },
  };
}

export const aiTraceContext = {
  async run<T>(opts: RunTraceOptions, fn: () => Promise<T>): Promise<T> {
    const cfg = resolveAiTraceConfig();
    const traceId = opts.inherit?.traceId ?? generateTraceId();
    const trace: AiTrace = {
      traceId,
      kind: opts.kind,
      context: opts.context,
      startedAt: new Date().toISOString(),
      status: 'in-progress',
      spanCount: 0,
      env: cfg.env,
    };

    try {
      getTraceSink().writeTraceStart({ _t: 'trace-start', ...trace });
    } catch (err) {
      consoleWarn('writeTraceStart failed', err);
    }

    const frame: TraceFrame = { trace, spanStack: [], spanCount: 0 };

    let errorThrown: unknown = null;
    try {
      return await storage.run(frame, fn);
    } catch (err) {
      errorThrown = err;
      throw err;
    } finally {
      const endedAt = new Date().toISOString();
      const durationMs = Date.parse(endedAt) - Date.parse(trace.startedAt);
      try {
        getTraceSink().writeTraceEnd({
          _t: 'trace-end',
          traceId,
          endedAt,
          durationMs,
          status: errorThrown ? 'error' : 'ok',
          errorSummary: errorThrown ? summarizeError(errorThrown) : undefined,
          spanCount: frame.spanCount,
        });
      } catch (err) {
        consoleWarn('writeTraceEnd failed', err);
      }
    }
  },

  startSpan(opts: WithSpanOptions): SpanHandle {
    const frame = storage.getStore();
    if (!frame) {
      return {
        spanId: 'noop',
        end: () => undefined,
        addEvent: () => undefined,
      };
    }
    const parent = frame.spanStack[frame.spanStack.length - 1];
    const span = buildSpan(opts, frame.trace.traceId, parent?.spanId);
    frame.spanStack.push(span);
    frame.spanCount += 1;
    let closed = false;
    return {
      spanId: span.spanId,
      end: (result) => {
        if (closed) return;
        closed = true;
        const finalized = finalizeSpan(span, result);
        const idx = frame.spanStack.indexOf(span);
        if (idx !== -1) frame.spanStack.splice(idx, 1);
        try {
          getTraceSink().writeSpan({ _t: 'span', ...finalized });
        } catch (err) {
          consoleWarn('writeSpan failed', err);
        }
      },
      addEvent: (event) => {
        span.events.push({ at: new Date().toISOString(), ...event });
      },
    };
  },

  async withSpan<T>(opts: WithSpanOptions, fn: () => Promise<T>): Promise<T> {
    let handle: SpanHandle | null = null;
    try { handle = this.startSpan(opts); }
    catch (err) { consoleWarn('startSpan failed', err); return fn(); }

    try {
      const result = await fn();
      handle.end({ status: 'ok' });
      return result;
    } catch (err) {
      handle.end({ status: 'error', error: err });
      throw err;
    }
  },

  async withLLMSpan<T>(
    opts: { source: string; modelId?: string; providerId?: string; promptText?: string },
    fn: () => Promise<T>,
  ): Promise<T> {
    return this.withSpan(
      {
        kind: 'llm-call',
        name: `callLLM[${opts.providerId ?? '?'}/${opts.modelId ?? '?'}]`,
        attrs: {
          source: opts.source,
          providerId: opts.providerId,
          modelId: opts.modelId,
          promptText: opts.promptText,
          promptChars: opts.promptText?.length,
        },
      },
      async () => {
        const result = await fn();
        const r = result as { text?: string; usage?: { inputTokens?: number; outputTokens?: number } };
        const frame = storage.getStore();
        const topSpan = frame?.spanStack.at(-1);
        if (topSpan) {
          // mutate currently active span attrs in place; withSpan's end() will spread them out
          Object.assign(topSpan.attrs as Record<string, unknown>, {
            responseText: r.text,
            responseChars: r.text?.length,
            inputTokens: r.usage?.inputTokens,
            outputTokens: r.usage?.outputTokens,
          });
        }
        return result;
      },
    );
  },

  currentTraceId(): string | null {
    return storage.getStore()?.trace.traceId ?? null;
  },
};
