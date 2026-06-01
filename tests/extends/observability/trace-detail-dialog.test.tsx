// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { TraceDetailDialog } from '@/components/extends/observability/trace-detail-dialog';
import { useTraceDetailStore } from '@/lib/extends/observability/trace-detail-store';
import type { TraceDetailView } from '@/lib/extends/observability/trace-reader';

vi.mock('@/lib/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${JSON.stringify(vars)}` : key,
  }),
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({
    open,
    children,
  }: {
    readonly open: boolean;
    readonly onOpenChange?: (open: boolean) => void;
    readonly children: React.ReactNode;
  }) => (open ? React.createElement(React.Fragment, null, children) : null),
  DialogContent: ({
    children,
  }: {
    readonly children: React.ReactNode;
    readonly className?: string;
  }) => React.createElement('div', { 'data-dialog-content': 'true' }, children),
  DialogHeader: ({
    children,
  }: {
    readonly children: React.ReactNode;
  }) => React.createElement('div', { 'data-dialog-header': 'true' }, children),
  DialogTitle: ({
    children,
  }: {
    readonly children: React.ReactNode;
  }) => React.createElement('h2', { 'data-dialog-title': 'true' }, children),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    ...props
  }: {
    readonly children: React.ReactNode;
    readonly onClick?: () => void;
    readonly [key: string]: unknown;
  }) => React.createElement('button', { onClick, ...props }, children),
}));

vi.mock('lucide-react', () => ({
  Copy: () => React.createElement('span', { 'data-testid': 'copy-icon' }),
}));

const fetchMock = vi.fn();
const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = fetchMock as never;
  fetchMock.mockReset();
  useTraceDetailStore.getState().closeTrace();
});

afterEach(() => {
  global.fetch = originalFetch;
  cleanup();
});

const mockDetail: TraceDetailView = {
  trace: {
    traceId: 't-abc',
    kind: 'chapter-generation',
    context: { projectId: 'P1', userVisibleTitle: '测试章节' },
    startedAt: '2026-05-28T05:00:00.000Z',
    endedAt: '2026-05-28T05:02:30.000Z',
    durationMs: 150000,
    status: 'error',
    errorSummary: 'Failed at scene-content[1]',
    spanCount: 2,
    env: 'test',
  },
  spans: [
    {
      spanId: 'sp1',
      traceId: 't-abc',
      kind: 'workflow-step',
      name: 'outline',
      attrs: { modelId: 'mimo', outputTokens: 1000 },
      startedAt: '2026-05-28T05:00:00.000Z',
      endedAt: '2026-05-28T05:00:42.000Z',
      durationMs: 42000,
      status: 'ok',
      events: [],
    },
    {
      spanId: 'sp2',
      traceId: 't-abc',
      kind: 'workflow-step',
      name: 'scene-content[1]',
      attrs: {},
      startedAt: '2026-05-28T05:00:42.000Z',
      endedAt: '2026-05-28T05:02:13.000Z',
      durationMs: 91000,
      status: 'error',
      error: { message: 'AI_RetryError', httpStatus: 502 },
      events: [],
    },
  ],
  status: 'error',
};

describe('TraceDetailDialog', () => {
  test('does not render when traceId is null', () => {
    render(<TraceDetailDialog />);
    expect(screen.queryByText(/Trace ID/)).toBeNull();
  });

  test('opens and fetches when traceId is set', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true, data: mockDetail }),
    });

    render(<TraceDetailDialog />);
    useTraceDetailStore.getState().openTrace('t-abc', 'chapter-card');

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/extends/ai-traces/t-abc?view=teacher',
      );
    });
    await waitFor(() => {
      expect(screen.getByText('outline')).toBeInTheDocument();
      expect(screen.getByText('scene-content[1]')).toBeInTheDocument();
    });
  });

  test('shows error and retry button on fetch failure', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network down'));

    render(<TraceDetailDialog />);
    useTraceDetailStore.getState().openTrace('t-err', 'toast');

    await waitFor(() => {
      expect(screen.getByText(/Network down/)).toBeInTheDocument();
      expect(screen.getByText('observability.retry')).toBeInTheDocument();
    });
  });

  test('shows not-found message for 404', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: () =>
        Promise.resolve({
          success: false,
          errorCode: 'INVALID_REQUEST',
          error: 'Trace not found: missing',
        }),
    });

    render(<TraceDetailDialog />);
    useTraceDetailStore.getState().openTrace('missing', 'drawer');

    await waitFor(() => {
      expect(
        screen.getByText('observability.traceNotFound'),
      ).toBeInTheDocument();
    });
  });

  test('closing dialog clears store traceId', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true, data: mockDetail }),
    });

    render(<TraceDetailDialog />);
    useTraceDetailStore.getState().openTrace('t-abc');

    await waitFor(() =>
      expect(screen.getByText('outline')).toBeInTheDocument(),
    );

    useTraceDetailStore.getState().closeTrace();
    expect(useTraceDetailStore.getState().traceId).toBeNull();
  });
});
