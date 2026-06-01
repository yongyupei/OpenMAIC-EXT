'use client';

import Link from 'next/link';
import { useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Copy } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useTraceDetailStore } from '@/lib/extends/observability/trace-detail-store';
import { useTraceDetail } from '@/lib/extends/observability/use-trace-detail';
import { TraceSpanTimeline } from './trace-span-timeline';

function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return '-';
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}s`;
}

export function TraceDetailDialog() {
  const traceId = useTraceDetailStore((s) => s.traceId);
  const closeTrace = useTraceDetailStore((s) => s.closeTrace);
  const { t } = useI18n();
  const { data, loading, error, notFound, retry } = useTraceDetail(traceId);

  const onCopyTraceId = useCallback(() => {
    if (traceId) {
      void navigator.clipboard?.writeText(traceId);
    }
  }, [traceId]);

  const open = traceId !== null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeTrace();
      }}
    >
      <DialogContent className="w-[min(96vw,1100px)] flex max-h-[90vh] flex-col">
        <DialogHeader>
          <DialogTitle>
            {data?.trace.status === 'error'
              ? t('observability.dialogTitleError', {
                  title: data.trace.context.userVisibleTitle ?? traceId ?? '',
                })
              : t('observability.dialogTitleOk')}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="py-6 text-center text-muted-foreground">
              {t('observability.loading')}
            </div>
          )}

          {notFound && (
            <div className="py-6 text-center text-muted-foreground">
              {t('observability.traceNotFound')}
            </div>
          )}

          {error && !notFound && (
            <div className="py-6 text-center space-y-2">
              <div className="text-red-600">{error}</div>
              <Button variant="outline" size="sm" onClick={retry}>
                {t('observability.retry')}
              </Button>
            </div>
          )}

          {data && (
            <>
              <div className="mb-4 space-y-1 text-sm text-muted-foreground">
                <div>
                  {t('observability.metadataDuration', {
                    duration: formatDuration(data.trace.durationMs),
                  })}
                </div>
                {(() => {
                  const llmSpan = data.spans.find((s) => s.attrs.modelId);
                  return llmSpan ? (
                    <div>
                      {t('observability.metadataModel', { model: llmSpan.attrs.modelId })}
                    </div>
                  ) : null;
                })()}
                {data.trace.status === 'error' &&
                  (() => {
                    const failedSpan = data.spans.find((s) => s.status === 'error');
                    return failedSpan ? (
                      <div>
                        {t('observability.metadataFailedAt', { step: failedSpan.name })}
                      </div>
                    ) : null;
                  })()}
              </div>

              <TraceSpanTimeline spans={data.spans} />

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
                <span className="font-mono">Trace ID: {traceId}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onCopyTraceId}
                  className="h-6 px-2"
                  aria-label={t('observability.copyTraceId')}
                >
                  <Copy className="h-3 w-3" />
                </Button>
                {traceId ? (
                  <Link
                    href={`/dev/ai-traces/${encodeURIComponent(traceId)}`}
                    prefetch={false}
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    {t('observability.openInDevUi')}
                  </Link>
                ) : null}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
