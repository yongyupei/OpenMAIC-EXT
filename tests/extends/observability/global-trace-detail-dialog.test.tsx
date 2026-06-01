// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { GlobalTraceDetailDialog } from '@/components/extends/observability/global-trace-detail-dialog';
import { useTraceDetailStore } from '@/lib/extends/observability/trace-detail-store';

vi.mock('@/components/extends/observability/trace-detail-dialog', () => ({
  TraceDetailDialog: () =>
    React.createElement('div', { 'data-testid': 'trace-detail-dialog' }),
}));

describe('GlobalTraceDetailDialog', () => {
  afterEach(() => {
    cleanup();
    useTraceDetailStore.getState().closeTrace();
  });

  test('renders TraceDetailDialog mount', () => {
    const { getByTestId } = render(<GlobalTraceDetailDialog />);
    expect(getByTestId('trace-detail-dialog')).toBeInTheDocument();
  });
});
