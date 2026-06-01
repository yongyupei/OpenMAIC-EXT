// lib/extends/observability/redaction.ts
import type { AiSpan } from './trace-types';

const TEACHER_TEXT_MAX = 200;
const TEACHER_BODY_MAX = 400;

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

function stringifySafe(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Strip sensitive details from a span for the teacher-facing diagnostic view.
 *
 * - promptText / responseText → truncated to 200 chars + ellipsis
 * - httpRequestBody → removed entirely (may contain api keys / pii)
 * - httpResponseBody → stringified + truncated to 400 chars
 * - error.stack → removed (file paths leak project layout)
 * - error.upstreamBody → truncated to 400 chars (full HTML/JSON kept for developer view)
 *
 * All metadata (modelId / providerId / inputTokens / durationMs / etc.) is preserved.
 */
export function redactSpanForTeacher(span: AiSpan): AiSpan {
  const attrs = { ...span.attrs };
  if (attrs.promptText) attrs.promptText = truncate(attrs.promptText, TEACHER_TEXT_MAX);
  if (attrs.responseText) attrs.responseText = truncate(attrs.responseText, TEACHER_TEXT_MAX);
  delete attrs.httpRequestBody;
  if (attrs.httpResponseBody !== undefined) {
    attrs.httpResponseBody = truncate(stringifySafe(attrs.httpResponseBody), TEACHER_BODY_MAX);
  }

  const error = span.error
    ? {
        message: span.error.message,
        kind: span.error.kind,
        httpStatus: span.error.httpStatus,
        upstreamBody: span.error.upstreamBody
          ? truncate(span.error.upstreamBody, TEACHER_BODY_MAX)
          : undefined,
      }
    : undefined;

  return { ...span, attrs, error };
}
