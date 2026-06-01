import type { AiSpan, AiTrace, SpanStatus, TraceIndexEntry } from '../trace-types';

export interface FormatOptions {
  readonly full: boolean;
}

const ICONS: Record<SpanStatus, string> = {
  ok: '✓',
  error: '✗',
  'in-progress': '◐',
  fallback: '⚠',
};

function formatDurationMs(ms: number | undefined): string {
  if (ms === undefined) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function statusToUpper(s: AiTrace['status']): string {
  return s.toUpperCase();
}

export function formatTraceForCli(
  data: { trace: AiTrace; spans: AiSpan[] },
  opts: FormatOptions,
): string {
  const { trace, spans } = data;
  const lines: string[] = [];

  lines.push('═'.repeat(67));
  lines.push(`  Trace ${trace.traceId} · ${trace.kind} · ${statusToUpper(trace.status)}`);
  lines.push('═'.repeat(67));
  lines.push('');
  lines.push(`  Started:    ${trace.startedAt}`);
  lines.push(`  Duration:   ${formatDurationMs(trace.durationMs)}`);
  lines.push(
    `  Status:     ${trace.status}${trace.errorSummary ? `  →  ${trace.errorSummary}` : ''}`,
  );
  if (trace.context.projectId) lines.push(`  Project:    ${trace.context.projectId}`);
  if (trace.context.chapterId) {
    lines.push(
      `  Chapter:    ${trace.context.chapterId}${trace.context.userVisibleTitle ? `  (${trace.context.userVisibleTitle})` : ''}`,
    );
  }
  if (trace.context.attempt) lines.push(`  Attempt:    ${trace.context.attempt}`);
  lines.push(`  Env: ${trace.env}${trace.appVersion ? ` · App: ${trace.appVersion}` : ''}`);
  lines.push('');
  lines.push(`─── Spans (${spans.length}) ${'─'.repeat(45)}`);
  lines.push('');

  for (const span of spans) {
    const icon = ICONS[span.status] ?? '?';
    const dur = formatDurationMs(span.durationMs).padStart(8);
    const meta: string[] = [];
    if (span.attrs.modelId) meta.push(span.attrs.modelId);
    if (span.attrs.outputTokens !== undefined) meta.push(`${span.attrs.outputTokens} tok`);
    lines.push(`  ${icon} ${span.name.padEnd(30)} ${dur}   ${meta.join('  ')}`);

    if (span.status === 'error' && span.error) {
      lines.push('');
      if (span.events.length > 0) {
        lines.push('      Retry events:');
        for (const e of span.events) lines.push(`        - ${e.kind} ${e.message}`);
        lines.push('');
      }
      lines.push(`      Error: ${span.error.kind ?? ''} - ${span.error.message}`);
      if (span.error.httpStatus) lines.push(`      HTTP status: ${span.error.httpStatus}`);
      if (span.error.upstreamBody) {
        lines.push('      Upstream body (excerpt):');
        lines.push(`        ${span.error.upstreamBody.slice(0, 200).replace(/\n/g, '\n        ')}`);
      }
      if (opts.full && span.error.stack) {
        lines.push('      Stack:');
        span.error.stack.split('\n').slice(0, 10).forEach((l) => lines.push(`        ${l}`));
      }
    }

    if (opts.full && span.attrs.promptText) {
      lines.push(`      Prompt (${span.attrs.promptText.length} chars):`);
      lines.push(`        ${span.attrs.promptText}`);
    } else if (span.attrs.promptChars) {
      lines.push(`      Prompt: ${span.attrs.promptChars} chars (use --full to print)`);
    }

    if (opts.full && span.attrs.responseText) {
      lines.push(`      Response (${span.attrs.responseText.length} chars):`);
      lines.push(`        ${span.attrs.responseText}`);
    }
    lines.push('');
  }

  lines.push('═'.repeat(67));
  return lines.join('\n');
}

const LIST_STATUS_ICON: Record<string, string> = {
  ok: '✓',
  error: '✗',
  partial: '◐',
  'in-progress': '…',
};

export function formatTraceListForCli(items: readonly TraceIndexEntry[]): string {
  if (items.length === 0) return '(no traces)';
  const lines: string[] = [];
  lines.push('STATUS  TRACE ID                          KIND                      DURATION  STARTED');
  lines.push('-'.repeat(90));
  for (const e of items) {
    const icon = LIST_STATUS_ICON[e.status] ?? '?';
    const dur =
      e.durationMs !== undefined
        ? e.durationMs < 1000
          ? `${e.durationMs}ms`
          : `${(e.durationMs / 1000).toFixed(1)}s`
        : '-';
    lines.push(
      `${icon.padEnd(6)}  ${e.traceId.slice(0, 32).padEnd(32)}  ${e.kind.padEnd(24)}  ${dur.padStart(8)}  ${e.startedAt}`,
    );
    if (e.context.userVisibleTitle || e.errorSummary) {
      const bits = [
        e.context.userVisibleTitle,
        e.errorSummary ? `→ ${e.errorSummary}` : undefined,
      ].filter(Boolean);
      lines.push(`        ${bits.join(' ')}`);
    }
  }
  return lines.join('\n');
}
