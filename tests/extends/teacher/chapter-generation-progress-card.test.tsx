/**
 * @extends-from tests/teacher/chapter-generation-progress-card.test.tsx
 * @fork-branch feat/html-slide-design-workbench
 *
 * Render-time assertions for the awaiting-outline-approval branch of
 * ChapterGenerationProgressCard — verifies the outline review list shows
 * scene titles, descriptions and key points, plus the approve button.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';

import { ChapterGenerationProgressCard } from '@/components/teacher/chapter-generation-progress-card';
import type { SceneOutline } from '@/lib/types/generation';

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
  }: {
    readonly children: React.ReactNode;
    readonly href: string;
  }) => React.createElement('a', { href }, children),
}));

vi.mock('@/lib/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values && Object.keys(values).length > 0
        ? `${key}:${Object.entries(values)
            .map(([k, v]) => `${k}=${String(v)}`)
            .join(',')}`
        : key,
  }),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: {
    readonly children: React.ReactNode;
    readonly [key: string]: unknown;
  }) => React.createElement('button', props, children),
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({
    children,
    ...props
  }: {
    readonly children: React.ReactNode;
    readonly [key: string]: unknown;
  }) => React.createElement('div', props, children),
}));

vi.mock('motion/react', () => ({
  motion: new Proxy(
    {},
    {
      get: () =>
        ({
          children,
          ...rest
        }: {
          readonly children?: React.ReactNode;
          readonly [key: string]: unknown;
        }) =>
          React.createElement('div', rest, children),
    },
  ),
  AnimatePresence: ({ children }: { readonly children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

vi.mock('@/app/generation-preview/components/visualizers', () => ({
  StepVisualizer: () => React.createElement('div', { 'data-step-visualizer': true }),
}));

vi.mock('@/components/generation/outlines-editor', () => ({
  OutlinesEditor: ({ outlines }: { readonly outlines: readonly { title: string }[] }) =>
    React.createElement(
      'div',
      { 'data-outlines-editor': 'true', 'data-count': String(outlines.length) },
      ...outlines.map((o, i) => React.createElement('span', { key: i }, o.title)),
    ),
}));

function makeOutline(overrides: Partial<SceneOutline> = {}): SceneOutline {
  return {
    id: 'o-1',
    type: 'slide',
    title: 'Outline title',
    description: 'Outline description',
    keyPoints: ['Point A', 'Point B'],
    order: 0,
    ...overrides,
  };
}

describe('ChapterGenerationProgressCard outline review', () => {
  test('renders OutlinesEditor with pendingOutlines when awaiting approval (matches generation-preview UX)', () => {
    const outlines = [
      makeOutline({ id: 'o-1', order: 0, title: 'Intro to AI coding' }),
      makeOutline({
        id: 'o-2',
        order: 1,
        type: 'quiz',
        title: 'Concept check',
      }),
    ];

    const html = renderToStaticMarkup(
      React.createElement(ChapterGenerationProgressCard, {
        phase: 'awaiting-approval',
        chapterTitle: 'AI 编程的演进历史',
        chapterOrder: 1,
        errorMessage: null,
        backHref: '/teacher/design',
        studioHref: '/teacher/studio',
        pendingOutlines: outlines,
        onPendingOutlinesChange: () => undefined,
        onBack: () => undefined,
        onApproveOutline: () => undefined,
      }),
    );

    expect(html).toContain('data-outlines-editor="true"');
    expect(html).toContain('data-count="2"');
    expect(html).toContain('Intro to AI coding');
    expect(html).toContain('Concept check');
    expect(html).toContain('generation.reviewOutlineTitle');
    // The full-page editor screen replaces the small progress card UI.
    expect(html).not.toContain('teacher.chapter.approveOutlineContinue');
  });

  test('falls back to the small awaiting-approval card when onPendingOutlinesChange is omitted', () => {
    const html = renderToStaticMarkup(
      React.createElement(ChapterGenerationProgressCard, {
        phase: 'awaiting-approval',
        chapterTitle: 'AI 编程',
        chapterOrder: 1,
        errorMessage: null,
        backHref: '/teacher/design',
        studioHref: '/teacher/studio',
        pendingOutlines: [makeOutline()],
        onBack: () => undefined,
        onApproveOutline: () => undefined,
      }),
    );

    expect(html).toContain('data-step-visualizer="true"');
    expect(html).toContain('teacher.chapter.approveOutlineContinue');
    expect(html).not.toContain('data-outlines-editor="true"');
  });

  test('falls back to step visualizer when outlines are empty', () => {
    const html = renderToStaticMarkup(
      React.createElement(ChapterGenerationProgressCard, {
        phase: 'awaiting-approval',
        chapterTitle: 'AI 编程',
        chapterOrder: 1,
        errorMessage: null,
        backHref: '/teacher/design',
        studioHref: '/teacher/studio',
        pendingOutlines: [],
        onPendingOutlinesChange: () => undefined,
        onBack: () => undefined,
        onApproveOutline: () => undefined,
      }),
    );

    expect(html).toContain('data-step-visualizer="true"');
    expect(html).toContain('teacher.chapter.approveOutlineContinue');
    expect(html).not.toContain('data-outlines-editor="true"');
  });

  test('failed phase shows diagnose button when lastTraceId is set', () => {
    const html = renderToStaticMarkup(
      React.createElement(ChapterGenerationProgressCard, {
        phase: 'failed',
        chapterTitle: 'AI 编程',
        chapterOrder: 1,
        errorMessage: 'Something broke',
        backHref: '/teacher/design',
        studioHref: '/teacher/studio',
        lastTraceId: 'trace-xyz',
        onBack: () => undefined,
        onRetry: () => undefined,
      }),
    );

    expect(html).toContain('data-testid="chapter-progress-diagnose"');
    expect(html).toContain('observability.diagnoseButton');
  });

  test('does not render outline editor while still generating', () => {
    const outlines = [makeOutline({ title: 'Should-not-leak' })];
    const html = renderToStaticMarkup(
      React.createElement(ChapterGenerationProgressCard, {
        phase: 'outlining',
        chapterTitle: 'AI 编程',
        chapterOrder: 1,
        errorMessage: null,
        backHref: '/teacher/design',
        studioHref: '/teacher/studio',
        pendingOutlines: outlines,
        onPendingOutlinesChange: () => undefined,
        onBack: () => undefined,
      }),
    );

    expect(html).not.toContain('Should-not-leak');
    expect(html).not.toContain('data-outlines-editor="true"');
  });
});
