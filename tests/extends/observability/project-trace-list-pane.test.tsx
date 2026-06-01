// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ProjectTraceListPane } from '@/components/extends/observability/project-trace-list-pane';
import { useTraceDetailStore } from '@/lib/extends/observability/trace-detail-store';
import type { TraceIndexEntry } from '@/lib/extends/observability/trace-types';

vi.mock('@/lib/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
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

const mockEntry: TraceIndexEntry = {
  traceId: 'trace-abc',
  kind: 'chapter-generation',
  status: 'error',
  startedAt: '2026-05-28T10:00:00.000Z',
  durationMs: 120_000,
  context: { projectId: 'p1', chapterId: 'ch1' },
  file: '2026-05-28/trace-abc.jsonl',
};

const fetchMock = vi.fn();

describe('ProjectTraceListPane', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as typeof fetch;
    useTraceDetailStore.getState().closeTrace();
  });

  afterEach(() => {
    cleanup();
    useTraceDetailStore.getState().closeTrace();
  });

  test('renders rows and opens trace on click', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { items: [mockEntry], total: 1 },
      }),
    });

    render(<ProjectTraceListPane projectId="p1" />);

    const row = await screen.findByTestId('project-trace-row-trace-abc');
    fireEvent.click(row);

    expect(useTraceDetailStore.getState().traceId).toBe('trace-abc');
    expect(useTraceDetailStore.getState().source).toBe('drawer');
  });
});
