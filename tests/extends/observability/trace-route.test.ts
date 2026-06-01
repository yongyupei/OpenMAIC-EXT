import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { NextRequest } from 'next/server';
import { parseTraceHeaders, runHandlerWithOptionalRequestTrace } from '@/lib/extends/observability/trace-route';
import { encodeTraceContextHeader } from '@/lib/extends/observability/trace-context-header';
import { aiTraceContext } from '@/lib/extends/observability/trace-context';
import { __resetTraceSink } from '@/lib/extends/observability/trace-sink';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('parseTraceHeaders', () => {
  test('returns null when header missing', () => {
    const req = new NextRequest('http://localhost/api/extends/generate/scene-content');
    expect(parseTraceHeaders(req)).toBeNull();
  });

  test('parses trace headers', () => {
    const req = new NextRequest('http://localhost/api/extends/generate/scene-content', {
      headers: {
        'x-ai-trace-id': 'trace-xyz',
        'x-ai-trace-kind': 'scene-redesign',
        'x-ai-trace-context': JSON.stringify({ sceneOutlineId: 's1', userVisibleTitle: 'Intro' }),
      },
    });
    const parsed = parseTraceHeaders(req);
    expect(parsed?.traceId).toBe('trace-xyz');
    expect(parsed?.kind).toBe('scene-redesign');
    expect(parsed?.context.sceneOutlineId).toBe('s1');
  });

  test('parses encoded trace headers with unicode context', () => {
    const req = new NextRequest('http://localhost/api/extends/generate/scene-content', {
      headers: {
        'x-ai-trace-id': 'trace-xyz',
        'x-ai-trace-kind': 'scene-redesign',
        'x-ai-trace-context': encodeTraceContextHeader({
          sceneOutlineId: 's1',
          userVisibleTitle: 'AI编程概览',
        }),
      },
    });
    const parsed = parseTraceHeaders(req);
    expect(parsed?.context.userVisibleTitle).toBe('AI编程概览');
  });
});

describe('runHandlerWithOptionalRequestTrace', () => {
  let tmpDir = '';

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'trace-route-'));
    process.env.AI_TRACE_ROOT_DIR = tmpDir;
    __resetTraceSink();
  });

  afterEach(() => {
    delete process.env.AI_TRACE_ROOT_DIR;
    if (tmpDir && existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  test('starts new trace when no headers', async () => {
    let seen: string | null = null;
    const req = new NextRequest('http://localhost');
    await runHandlerWithOptionalRequestTrace(
      req,
      { defaultKind: 'preview-scene-content' },
      async () => {
        seen = aiTraceContext.currentTraceId();
        return new Response('ok');
      },
    );
    expect(seen).toBeTruthy();
  });

  test('inherits trace id from headers', async () => {
    let seen: string | null = null;
    const req = new NextRequest('http://localhost', {
      headers: { 'x-ai-trace-id': 'inherited-id', 'x-ai-trace-kind': 'scene-redesign' },
    });
    await runHandlerWithOptionalRequestTrace(
      req,
      { defaultKind: 'preview-scene-content' },
      async () => {
        seen = aiTraceContext.currentTraceId();
        return new Response('ok');
      },
    );
    expect(seen).toBe('inherited-id');
  });
});
