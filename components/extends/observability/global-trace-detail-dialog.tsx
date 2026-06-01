'use client';

import { TraceDetailDialog } from './trace-detail-dialog';

/** Root-level mount: subscribes to `useTraceDetailStore` via TraceDetailDialog. */
export function GlobalTraceDetailDialog() {
  return <TraceDetailDialog />;
}
