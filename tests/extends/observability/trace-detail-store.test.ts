import { beforeEach, describe, expect, test } from 'vitest';
import { useTraceDetailStore } from '@/lib/extends/observability/trace-detail-store';

beforeEach(() => {
  useTraceDetailStore.getState().closeTrace();
});

describe('useTraceDetailStore', () => {
  test('initial state has no active trace', () => {
    const state = useTraceDetailStore.getState();
    expect(state.traceId).toBeNull();
    expect(state.source).toBeUndefined();
  });

  test('openTrace sets traceId + source', () => {
    useTraceDetailStore.getState().openTrace('t-123', 'chapter-card');
    const state = useTraceDetailStore.getState();
    expect(state.traceId).toBe('t-123');
    expect(state.source).toBe('chapter-card');
  });

  test('openTrace without source defaults to undefined source', () => {
    useTraceDetailStore.getState().openTrace('t-456');
    expect(useTraceDetailStore.getState().source).toBeUndefined();
  });

  test('closeTrace clears traceId and source', () => {
    useTraceDetailStore.getState().openTrace('t-1', 'toast');
    useTraceDetailStore.getState().closeTrace();
    const state = useTraceDetailStore.getState();
    expect(state.traceId).toBeNull();
    expect(state.source).toBeUndefined();
  });

  test('opening a new trace replaces previous', () => {
    useTraceDetailStore.getState().openTrace('a', 'chapter-card');
    useTraceDetailStore.getState().openTrace('b', 'drawer');
    const state = useTraceDetailStore.getState();
    expect(state.traceId).toBe('b');
    expect(state.source).toBe('drawer');
  });
});
