'use client';

import { useCallback, useEffect, useState } from 'react';
import type { TraceIndexEntry } from './trace-types';

export interface UseProjectTraceListResult {
  readonly items: readonly TraceIndexEntry[];
  readonly total: number;
  readonly loading: boolean;
  readonly error: string | null;
  readonly retry: () => void;
}

export function useProjectTraceList(
  projectId: string | undefined,
  options?: { limit?: number; enabled?: boolean },
): UseProjectTraceListResult {
  const limit = options?.limit ?? 50;
  const enabled = options?.enabled !== false && Boolean(projectId);
  const [items, setItems] = useState<readonly TraceIndexEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!enabled || !projectId) {
      return;
    }

    let cancelled = false;
    /* eslint-disable react-hooks/set-state-in-effect -- Reset fetch lifecycle when query inputs change */
    setLoading(true);
    setError(null);
    /* eslint-enable react-hooks/set-state-in-effect */

    const params = new URLSearchParams({
      projectId,
      limit: String(limit),
    });

    fetch(`/api/extends/ai-traces?${params.toString()}`)
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !body?.success) {
          setError(body?.error ?? `Request failed: ${res.status}`);
          return;
        }
        const data = body.data as { items?: TraceIndexEntry[]; total?: number };
        setItems(data.items ?? []);
        setTotal(data.total ?? 0);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, projectId, limit, reloadKey]);

  if (!enabled || !projectId) {
    return { items: [], total: 0, loading: false, error: null, retry };
  }

  return { items, total, loading, error, retry };
}
