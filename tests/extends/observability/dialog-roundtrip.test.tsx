// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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
    readonly children: React.ReactNode;
  }) => (open ? React.createElement(React.Fragment, null, children) : null),
  DialogContent: ({ children }: { readonly children: React.ReactNode }) =>
    React.createElement('div', null, children),
  DialogHeader: ({ children }: { readonly children: React.ReactNode }) =>
    React.createElement('div', null, children),
  DialogTitle: ({ children }: { readonly children: React.ReactNode }) =>
    React.createElement('h2', null, children),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
  }: {
    readonly children: React.ReactNode;
    readonly onClick?: () => void;
  }) => React.createElement('button', { onClick }, children),
}));

vi.mock('lucide-react', () => ({
  Copy: () => null,
}));

vi.mock('@/components/extends/observability/trace-span-timeline', () => ({
  TraceSpanTimeline: () => React.createElement('div', { 'data-testid': 'span-timeline' }),
}));

const fetchMock = vi.fn();

const mockDetail: TraceDetailView = {
  status: 'ok',
  trace: {
    traceId: 't1',
    kind: 'chapter-generation',
    context: { userVisibleTitle: 'Chapter 1' },
    startedAt: '2026-05-28T10:00:00.000Z',
    status: 'ok',
    env: 'test',
  },
  spans: [
    {
      spanId: 's1',
      traceId: 't1',
      kind: 'workflow-step',
      name: 'outline',
      attrs: {},
      startedAt: '2026-05-28T10:00:00.000Z',
      status: 'ok',
    },
  ],
};

describe('dialog roundtrip', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as typeof fetch;
    useTraceDetailStore.getState().closeTrace();
  });

  afterEach(() => {
    cleanup();
    useTraceDetailStore.getState().closeTrace();
  });

  test('openTrace loads detail and renders spans', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: mockDetail }),
    });

    useTraceDetailStore.getState().openTrace('t1', 'chapter-card');
    render(<TraceDetailDialog />);

    await waitFor(() => {
      expect(screen.getByTestId('span-timeline')).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/extends/ai-traces/t1?view=teacher');
  });
});
