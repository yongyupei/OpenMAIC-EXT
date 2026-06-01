'use client';

import { useEffect, useState } from 'react';
import type { TraceDetailView } from './trace-reader';

export interface UseTraceDetailResult {
  readonly data: TraceDetailView | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly notFound: boolean;
  readonly retry: () => void;
}

export function useTraceDetail(traceId: string | null): UseTraceDetailResult {
  const [data, setData] = useState<TraceDetailView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!traceId) {
      return;
    }

    let cancelled = false;
    /* eslint-disable react-hooks/set-state-in-effect -- Reset fetch lifecycle when trace id changes */
    setLoading(true);
    setError(null);
    setNotFound(false);
    /* eslint-enable react-hooks/set-state-in-effect */

    fetch(`/api/extends/ai-traces/${encodeURIComponent(traceId)}?view=teacher`)
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.status === 404) {
          setNotFound(true);
          setData(null);
          return;
        }
        if (!res.ok || !body?.success) {
          setError(body?.error ?? `Request failed: ${res.status}`);
          return;
        }
        setData(body.data as TraceDetailView);
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
  }, [traceId, reloadKey]);

  if (!traceId) {
    return {
      data: null,
      loading: false,
      error: null,
      notFound: false,
      retry: () => setReloadKey((k) => k + 1),
    };
  }

  return {
    data,
    loading,
    error,
    notFound,
    retry: () => setReloadKey((k) => k + 1),
  };
}
