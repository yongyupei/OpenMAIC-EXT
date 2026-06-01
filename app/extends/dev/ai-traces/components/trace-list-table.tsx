'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/hooks/use-i18n';
import { formatRelativeTime } from '@lib-extends/observability/format-relative-time';
import type { TraceIndexEntry, TraceStatus } from '@/lib/extends/observability/trace-types';

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
  if (ms === undefined) return '…';
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function TraceListTable({
  items,
}: {
  readonly items: readonly TraceIndexEntry[];
}) {
  const { t, locale } = useI18n();

  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {t('observability.devUi.table.empty')}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 w-8" />
            <th className="px-3 py-2">{t('observability.devUi.table.traceId')}</th>
            <th className="px-3 py-2">{t('observability.devUi.table.kind')}</th>
            <th className="px-3 py-2">{t('observability.devUi.table.projectChapter')}</th>
            <th className="px-3 py-2">{t('observability.devUi.table.duration')}</th>
            <th className="px-3 py-2">{t('observability.devUi.table.time')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((entry) => (
            <tr key={entry.traceId} className="border-b border-border/50 hover:bg-muted/30">
              <td className="px-3 py-2" title={entry.status}>
                {statusIcon(entry.status)}
              </td>
              <td className="px-3 py-2 font-mono text-xs">
                <Link
                  href={`/dev/ai-traces/${encodeURIComponent(entry.traceId)}`}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  {entry.traceId}
                </Link>
                {entry.context.attempt ? (
                  <div className="text-muted-foreground">
                    ({t(`observability.devUi.attempts.${entry.context.attempt}`)})
                  </div>
                ) : null}
              </td>
              <td className="px-3 py-2 font-mono text-xs">
                {t(`observability.devUi.kinds.${entry.kind}`)}
              </td>
              <td className="px-3 py-2 text-xs">
                <div className="font-mono truncate max-w-[14rem]">
                  {entry.context.projectId ?? '-'}
                  {entry.context.chapterId ? ` / ${entry.context.chapterId}` : ''}
                </div>
                {entry.context.userVisibleTitle ? (
                  <div className="text-muted-foreground truncate max-w-[14rem]">
                    {entry.context.userVisibleTitle}
                  </div>
                ) : null}
                {entry.errorSummary ? (
                  <div className="text-destructive truncate max-w-[14rem]">→ {entry.errorSummary}</div>
                ) : null}
              </td>
              <td className="px-3 py-2 tabular-nums">{formatDuration(entry.durationMs)}</td>
              <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                {formatRelativeTime(entry.startedAt, locale)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
