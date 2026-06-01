import type { NextRequest } from 'next/server';
import { aiTraceContext } from './trace-context';
import type { TraceBusinessContext, TraceKind } from './trace-types';
import { decodeTraceContextHeader } from './trace-context-header';

export interface ParsedRequestTrace {
  readonly traceId: string;
  readonly kind: TraceKind;
  readonly context: TraceBusinessContext;
}

/** Reads client-propagated trace headers (scene-redesign and similar). */
export function parseTraceHeaders(req: Request): ParsedRequestTrace | null {
  const traceId = req.headers.get('x-ai-trace-id')?.trim();
  if (!traceId) return null;

  const kindHeader = req.headers.get('x-ai-trace-kind');
  const kind = (kindHeader as TraceKind | null) ?? 'other';

  let context: TraceBusinessContext = {};
  const rawContext = req.headers.get('x-ai-trace-context');
  if (rawContext) {
    context = decodeTraceContextHeader(rawContext);
  }

  return { traceId, kind, context };
}

/**
 * Wraps a route handler in aiTraceContext.run.
 * When x-ai-trace-id is present, continues that trace (client propagation).
 */
export async function runHandlerWithOptionalRequestTrace<T>(
  req: NextRequest,
  opts: {
    readonly defaultKind: TraceKind;
    readonly defaultContext?: TraceBusinessContext;
  },
  handler: () => Promise<T>,
): Promise<T> {
  const inherited = parseTraceHeaders(req);
  const baseContext = opts.defaultContext ?? {};

  if (inherited) {
    return aiTraceContext.run(
      {
        kind: inherited.kind,
        context: { ...baseContext, ...inherited.context },
        inherit: { traceId: inherited.traceId },
      },
      handler,
    );
  }

  return aiTraceContext.run(
    {
      kind: opts.defaultKind,
      context: baseContext,
    },
    handler,
  );
}
