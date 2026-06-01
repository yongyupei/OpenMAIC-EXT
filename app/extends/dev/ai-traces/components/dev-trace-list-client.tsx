'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { TraceIndexEntry } from '@/lib/extends/observability/trace-types';
import { TraceFilterBar, type TraceListFilters } from './trace-filter-bar';
import { TraceListTable } from './trace-list-table';

const PAGE_SIZE = 50;

function buildQuery(filters: TraceListFilters, offset: number): string {
  const params = new URLSearchParams();
  params.set('limit', String(PAGE_SIZE));
  params.set('offset', String(offset));
  if (filters.kind) params.set('kind', filters.kind);
  if (filters.status) params.set('status', filters.status);
  if (filters.since) params.set('since', filters.since);
  if (filters.search.trim()) params.set('search', filters.search.trim());
  if (filters.projectId.trim()) params.set('projectId', filters.projectId.trim());
  return params.toString();
}

export function DevTraceListClient() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const initialProjectId = searchParams.get('projectId') ?? '';

  const [filters, setFilters] = useState<TraceListFilters>({
    kind: '',
    status: '',
    since: '7d',
    search: '',
    projectId: initialProjectId,
  });
  const [applied, setApplied] = useState(filters);
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<readonly TraceIndexEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/extends/ai-traces?${buildQuery(applied, offset)}`);
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.success) {
        setError(
          body?.error ??
            t('observability.devUi.requestFailed', { status: res.status }),
        );
        return;
      }
      setItems(body.data.items ?? []);
      setTotal(body.data.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [applied, offset, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(
    () =>
      t('observability.devUi.pagination.summary', {
        shown: items.length,
        total,
        page,
        pageCount,
      }),
    [items.length, total, page, pageCount, t],
  );

  return (
    <div className="space-y-4">
      <TraceFilterBar
        filters={filters}
        onChange={(patch) => setFilters((f) => ({ ...f, ...patch }))}
        onApply={() => {
          setApplied(filters);
          setOffset(0);
        }}
      />

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

      {!loading && !error ? (
        <>
          <TraceListTable items={items} />
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>{summary}</span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={offset === 0}
                onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
              >
                {t('observability.devUi.pagination.previous')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset((o) => o + PAGE_SIZE)}
              >
                {t('observability.devUi.pagination.next')}
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
