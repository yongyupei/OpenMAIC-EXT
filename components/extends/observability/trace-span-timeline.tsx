'use client';

import { useState } from 'react';
import type { AiSpan } from '@/lib/extends/observability/trace-types';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';

interface TraceSpanTimelineProps {
  readonly spans: ReadonlyArray<AiSpan>;
}

const STATUS_ICONS = {
  ok: '✓',
  error: '✗',
  'in-progress': '◐',
  fallback: '⚠',
} as const;

const STATUS_COLOR = {
  ok: 'text-green-600',
  error: 'text-red-600',
  'in-progress': 'text-blue-600',
  fallback: 'text-amber-600',
} as const;

function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function TraceSpanTimeline({ spans }: TraceSpanTimelineProps) {
  const topLevel = spans.filter((s) => !s.parentSpanId);
  const childrenByParent = new Map<string, AiSpan[]>();
  for (const s of spans) {
    if (s.parentSpanId) {
      const list = childrenByParent.get(s.parentSpanId) ?? [];
      list.push(s);
      childrenByParent.set(s.parentSpanId, list);
    }
  }

  return (
    <div className="space-y-1 font-mono text-sm">
      {topLevel.map((span) => (
        <SpanRow
          key={span.spanId}
          span={span}
          subSpans={childrenByParent.get(span.spanId) ?? []}
        />
      ))}
    </div>
  );
}

interface SpanRowProps {
  readonly span: AiSpan;
  readonly subSpans: ReadonlyArray<AiSpan>;
}

function SpanRow({ span, subSpans }: SpanRowProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(span.status === 'error');
  const hasDetails = span.status === 'error' || span.events.length > 0 || !!span.attrs.promptText;
  const hasSubSpans = subSpans.length > 0;
  const isExpandable = hasDetails || hasSubSpans;

  const tokens = span.attrs.outputTokens;
  const model = span.attrs.modelId;
  const meta: string[] = [];
  if (model) meta.push(model);
  if (tokens !== undefined) meta.push(`${tokens} tok`);

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          'flex w-full items-center gap-2 py-1 px-2 rounded hover:bg-muted/50 text-left',
          isExpandable ? 'cursor-pointer' : 'cursor-default',
        )}
      >
        <span
          className={cn(
            'inline-block w-4',
            STATUS_COLOR[span.status as keyof typeof STATUS_COLOR],
          )}
        >
          {STATUS_ICONS[span.status as keyof typeof STATUS_ICONS] ?? '?'}
        </span>
        <span className="flex-1 truncate">{span.name}</span>
        <span className="text-muted-foreground">{formatDuration(span.durationMs)}</span>
        {meta.length > 0 && (
          <span className="text-muted-foreground text-xs">{meta.join(' · ')}</span>
        )}
      </button>

      {expanded && (
        <div className="ml-6 mt-1 space-y-2 text-xs">
          {span.events.length > 0 && (
            <div>
              <div className="text-muted-foreground mb-1">
                {t('observability.spanRetryEvents', {
                  current: '?',
                  total: span.events.length,
                  delay: '',
                })}
              </div>
              <ul className="space-y-0.5">
                {span.events.map((e, i) => (
                  <li key={i} className="text-muted-foreground">
                    ↻ {e.kind}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {span.status === 'error' && span.error && (
            <div className="space-y-1 rounded bg-red-50 p-2 text-red-900">
              <div>
                <strong>{span.error.kind ?? 'Error'}</strong>: {span.error.message}
              </div>
              {span.error.httpStatus && (
                <div className="text-xs">HTTP {span.error.httpStatus}</div>
              )}
              {span.error.upstreamBody && (
                <details className="text-xs">
                  <summary className="cursor-pointer">{t('observability.spanUpstreamBody')}</summary>
                  <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all bg-white p-1">
                    {span.error.upstreamBody}
                  </pre>
                </details>
              )}
            </div>
          )}

          {span.attrs.promptText && (
            <details>
              <summary className="cursor-pointer text-muted-foreground">
                {t('observability.spanPromptExcerpt')}
              </summary>
              <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/50 p-2 text-xs">
                {span.attrs.promptText}
              </pre>
            </details>
          )}

          {subSpans.length > 0 && (
            <div className="ml-2 space-y-1 border-l-2 border-muted pl-2">
              {subSpans.map((c) => (
                <SpanRow key={c.spanId} span={c} subSpans={[]} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
