import { create } from 'zustand';

export type TraceDetailSource =
  | 'chapter-card'
  | 'progress-card'
  | 'toast'
  | 'drawer'
  | 'failure-dialog';

export interface TraceDetailStoreState {
  readonly traceId: string | null;
  readonly source: TraceDetailSource | undefined;
  readonly openTrace: (traceId: string, source?: TraceDetailSource) => void;
  readonly closeTrace: () => void;
}

/**
 * Global store for the unified AI trace detail dialog.
 *
 * Any code can open the dialog by calling:
 *   useTraceDetailStore.getState().openTrace(traceId, 'chapter-card');
 *
 * GlobalTraceDetailDialog (mounted once at the root) subscribes to `traceId`
 * and renders/closes the dialog accordingly. `source` is captured for
 * analytics + testing assertions about which entry point opened the dialog.
 */
export const useTraceDetailStore = create<TraceDetailStoreState>((set) => ({
  traceId: null,
  source: undefined,
  openTrace: (traceId, source) => set({ traceId, source }),
  closeTrace: () => set({ traceId: null, source: undefined }),
}));
