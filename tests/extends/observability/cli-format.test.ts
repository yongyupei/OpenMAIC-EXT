import { describe, expect, test } from 'vitest';
import { formatTraceForCli } from '@/lib/extends/observability/cli/format';
import type { AiSpan, AiTrace } from '@/lib/extends/observability/trace-types';

const trace: AiTrace = {
  traceId: 'abc123def456',
  kind: 'chapter-generation',
  context: { projectId: 'P1', chapterId: 'C1', userVisibleTitle: 'AI编程' },
  startedAt: '2026-05-28T11:55:00.000Z',
  endedAt: '2026-05-28T11:57:30.000Z',
  durationMs: 150000,
  status: 'error',
  errorSummary: 'Failed at scene-content[1]: AI_RetryError 502',
  spanCount: 3,
  env: 'dev',
};

const spans: AiSpan[] = [
  {
    spanId: 'sp1',
    traceId: 'abc',
    kind: 'workflow-step',
    name: 'outline',
    attrs: { modelId: 'mimo-v2.5', outputTokens: 1450 },
    startedAt: '...',
    endedAt: '...',
    durationMs: 42200,
    status: 'ok',
    events: [],
  },
  {
    spanId: 'sp2',
    traceId: 'abc',
    kind: 'workflow-step',
    name: 'scene-content[1]',
    attrs: {},
    startedAt: '...',
    endedAt: '...',
    durationMs: 91000,
    status: 'error',
    error: { message: 'AI_RetryError', httpStatus: 502 },
    events: [{ at: '...', kind: 'retry', message: 'attempt 2/3' }],
  },
];

describe('formatTraceForCli', () => {
  test('renders header with traceId, kind, status', () => {
    const out = formatTraceForCli({ trace, spans }, { full: false });
    expect(out).toContain('abc123def456');
    expect(out).toContain('chapter-generation');
    expect(out).toContain('ERROR');
  });

  test('lists each span with status icon and duration', () => {
    const out = formatTraceForCli({ trace, spans }, { full: false });
    expect(out).toContain('outline');
    expect(out).toContain('42.2');
    expect(out).toContain('scene-content[1]');
    expect(out).toContain('91.0');
  });

  test('shows error details when span has error', () => {
    const out = formatTraceForCli({ trace, spans }, { full: false });
    expect(out).toContain('AI_RetryError');
    expect(out).toContain('502');
    expect(out).toContain('retry');
  });

  test('--full prints promptText when present', () => {
    const fullSpan: AiSpan = {
      ...spans[0],
      attrs: { ...spans[0].attrs, promptText: 'A very long prompt that should show.' },
    };
    const out = formatTraceForCli({ trace, spans: [fullSpan] }, { full: true });
    expect(out).toContain('A very long prompt');
  });

  test('default mode omits promptText', () => {
    const fullSpan: AiSpan = {
      ...spans[0],
      attrs: { ...spans[0].attrs, promptText: 'A very long prompt' },
    };
    const out = formatTraceForCli({ trace, spans: [fullSpan] }, { full: false });
    expect(out).not.toContain('A very long prompt');
  });
});
