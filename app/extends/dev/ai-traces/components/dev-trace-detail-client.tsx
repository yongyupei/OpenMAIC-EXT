'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { TraceDetailView } from '@/lib/extends/observability/trace-reader';
import { DeveloperSpanDetail } from './developer-span-detail';

function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return '-';
  const sec = Math.round(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}s`;
}

export function DevTraceDetailClient({ traceId }: { readonly traceId: string }) {
  const { t } = useI18n();
  const [data, setData] = useState<TraceDetailView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/extends/ai-traces/${encodeURIComponent(traceId)}?view=developer`,
      );
      const body = await res.json().catch(() => null);
      if (res.status === 403) {
        setError(t('observability.devUi.detail.devDisabled'));
        return;
      }
      if (res.status === 404) {
        setError(t('observability.traceNotFound'));
        return;
      }
      if (!res.ok || !body?.success) {
        setError(
          body?.error ??
            t('observability.devUi.requestFailed', { status: res.status }),
        );
        return;
      }
      setData(body.data as TraceDetailView);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [traceId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const downloadUrl = `/api/extends/ai-traces/${encodeURIComponent(traceId)}/raw`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" asChild>
          <Link href="/dev/ai-traces">{t('observability.devUi.detail.backToList')}</Link>
        </Button>
        <Button type="button" variant="outline" size="sm" asChild>
          <a href={downloadUrl} download={`${traceId}.jsonl`}>
            {t('observability.devUi.detail.downloadRaw')}
          </a>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void navigator.clipboard?.writeText(traceId)}
        >
          {t('observability.devUi.detail.copyTraceId')}
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">{t('observability.loading')}</p>
      ) : null}
      {error ? (
        <div className="space-y-2">
          <p className="text-sm text-destructive">{error}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
            {t('observability.retry')}
          </Button>
        </div>
      ) : null}

      {data ? (
        <>
          <div className="rounded-lg border bg-card p-4 text-sm space-y-1">
            <h1 className="text-lg font-semibold font-mono">{traceId}</h1>
            <p>
              <span className="text-muted-foreground">{t('observability.devUi.detail.kindLabel')}</span>{' '}
              {t(`observability.devUi.kinds.${data.trace.kind}`)}
            </p>
            <p>
              <span className="text-muted-foreground">
                {t('observability.devUi.detail.statusLabel')}
              </span>{' '}
              {t(`observability.devUi.statusValues.${data.trace.status}`)}
            </p>
            <p>
              <span className="text-muted-foreground">
                {t('observability.devUi.detail.durationLabel')}
              </span>{' '}
              {formatDuration(data.trace.durationMs)}
            </p>
            {data.trace.errorSummary ? (
              <p className="text-destructive">{data.trace.errorSummary}</p>
            ) : null}
            {data.trace.context.userVisibleTitle ? (
              <p>{data.trace.context.userVisibleTitle}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <h2 className="text-sm font-semibold">
              {t('observability.devUi.detail.spansHeading', { count: data.spans.length })}
            </h2>
            {data.spans.map((span) => (
              <DeveloperSpanDetail key={span.spanId} span={span} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
