'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { AiSpan } from '@/lib/extends/observability/trace-types';
import { cn } from '@/lib/utils';

function copyText(text: string): void {
  void navigator.clipboard?.writeText(text);
}

function stringifyBody(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function DeveloperSpanDetail({ span }: { readonly span: AiSpan }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(span.status === 'error');

  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-3 font-mono text-xs">
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className={cn(span.status === 'error' && 'text-destructive')}>
          {span.status === 'error' ? '✗' : '✓'} {span.name}
        </span>
        <span className="text-muted-foreground">
          {span.durationMs !== undefined ? `${span.durationMs}ms` : ''}
          {span.attrs.modelId ? ` · ${span.attrs.modelId}` : ''}
        </span>
      </button>

      {expanded ? (
        <div className="mt-3 space-y-3">
          {span.error ? (
            <div className="space-y-1">
              <div className="font-semibold text-destructive">{span.error.message}</div>
              {span.error.stack ? (
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-background p-2 text-[11px]">
                  {span.error.stack}
                </pre>
              ) : null}
              {span.error.upstreamBody ? (
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-background p-2 text-[11px]">
                  {span.error.upstreamBody}
                </pre>
              ) : null}
            </div>
          ) : null}

          {span.attrs.promptText ? (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="font-semibold">promptText</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2"
                  onClick={() => copyText(span.attrs.promptText!)}
                >
                  {t('observability.devUi.detail.copy')}
                </Button>
              </div>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-background p-2">
                {span.attrs.promptText}
              </pre>
            </div>
          ) : null}

          {span.attrs.responseText ? (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="font-semibold">responseText</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2"
                  onClick={() => copyText(span.attrs.responseText!)}
                >
                  {t('observability.devUi.detail.copy')}
                </Button>
              </div>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-background p-2">
                {span.attrs.responseText}
              </pre>
            </div>
          ) : null}

          {span.attrs.httpRequestBody !== undefined ? (
            <div>
              <span className="font-semibold">httpRequestBody</span>
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-background p-2">
                {stringifyBody(span.attrs.httpRequestBody)}
              </pre>
            </div>
          ) : null}

          {span.attrs.httpResponseBody !== undefined ? (
            <div>
              <span className="font-semibold">httpResponseBody</span>
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-background p-2">
                {stringifyBody(span.attrs.httpResponseBody)}
              </pre>
            </div>
          ) : null}

          {span.events.length > 0 ? (
            <ul className="list-disc pl-4 text-muted-foreground">
              {span.events.map((e, i) => (
                <li key={`${e.at}-${i}`}>
                  {e.kind}: {e.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
