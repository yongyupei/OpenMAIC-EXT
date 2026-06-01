import { describe, expect, test } from 'vitest';
import { resolveTraceRootDir } from '@/lib/extends/observability/trace-paths';

describe('resolveTraceRootDir', () => {
  test('defaults to cwd/data/ai-traces', () => {
    const prev = process.env.AI_TRACE_ROOT_DIR;
    delete process.env.AI_TRACE_ROOT_DIR;
    expect(resolveTraceRootDir()).toMatch(/data[\\/]ai-traces$/);
    if (prev) process.env.AI_TRACE_ROOT_DIR = prev;
  });

  test('resolves relative env to absolute', () => {
    const prev = process.env.AI_TRACE_ROOT_DIR;
    process.env.AI_TRACE_ROOT_DIR = 'data/ai-traces';
    expect(resolveTraceRootDir()).toMatch(/data[\\/]ai-traces$/);
    if (prev) process.env.AI_TRACE_ROOT_DIR = prev;
    else delete process.env.AI_TRACE_ROOT_DIR;
  });
});
