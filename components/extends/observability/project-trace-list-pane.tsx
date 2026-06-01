'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useTraceDetailStore } from '@/lib/extends/observability/trace-detail-store';
import type { TraceIndexEntry, TraceStatus } from '@/lib/extends/observability/trace-types';
import { useProjectTraceList } from '@/lib/extends/observability/use-project-trace-list';
import { cn } from '@/lib/utils';

function statusIcon(status: TraceStatus): string {
  switch (status) {
    case 'ok':
      return '✓';
    case 'error':
      return '✕';
    case 'partial':
      return '◐';
    case 'in-progress':
      return '…';
    default:
      return '·';
  }
}

function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return '-';
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString();
}

export function ProjectTraceListPane({
  projectId,
  className,
  enabled = true,
}: {
  readonly projectId: string;
  readonly className?: string;
  readonly enabled?: boolean;
}) {
  const { t } = useI18n();
  const { items, loading, error, retry } = useProjectTraceList(projectId, { enabled });

  const onRowClick = (entry: TraceIndexEntry) => {
    useTraceDetailStore.getState().openTrace(entry.traceId, 'drawer');
  };

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t('observability.loading')}
        </p>
      ) : null}

      {error ? (
        <div className="space-y-2 py-6 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button type="button" variant="outline" size="sm" onClick={retry}>
            {t('observability.retry')}
          </Button>
        </div>
      ) : null}

      {!loading && !error && items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t('observability.emptyList')}
        </p>
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <table className="w-full table-fixed text-left text-xs">
            <thead className="sticky top-0 bg-background border-b">
              <tr className="text-muted-foreground">
                <th className="w-8 px-2 py-2" aria-hidden />
                <th className="w-[28%] px-2 py-2">{t('observability.listColumns.kind')}</th>
                <th className="w-[22%] px-2 py-2">{t('observability.listColumns.chapter')}</th>
                <th className="w-[10%] px-2 py-2">{t('observability.listColumns.duration')}</th>
                <th className="w-[12%] px-2 py-2">{t('observability.listColumns.status')}</th>
                <th className="w-[28%] px-2 py-2">{t('observability.listColumns.time')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((entry) => (
                <tr
                  key={entry.traceId}
                  className="border-b border-border/60 hover:bg-muted/50 cursor-pointer"
                  onClick={() => onRowClick(entry)}
                  data-testid={`project-trace-row-${entry.traceId}`}
                >
                  <td className="px-2 py-2 tabular-nums" title={entry.status}>
                    {statusIcon(entry.status)}
                  </td>
                  <td className="truncate px-2 py-2 font-mono" title={entry.kind}>
                    {entry.kind}
                  </td>
                  <td
                    className="truncate px-2 py-2 font-mono"
                    title={entry.context?.chapterId ?? undefined}
                  >
                    {entry.context?.chapterId ?? '-'}
                  </td>
                  <td className="px-2 py-2 tabular-nums">
                    {formatDuration(entry.durationMs)}
                  </td>
                  <td className="truncate px-2 py-2">{entry.status}</td>
                  <td className="truncate px-2 py-2 text-muted-foreground" title={formatTime(entry.startedAt)}>
                    {formatTime(entry.startedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <footer className="mt-auto border-t pt-3 text-xs text-muted-foreground">
        <Link
          href={`/dev/ai-traces?projectId=${encodeURIComponent(projectId)}`}
          prefetch={false}
          className="underline underline-offset-2 hover:text-foreground"
        >
          {t('observability.openInDevUi')}
        </Link>
      </footer>
    </div>
  );
}
