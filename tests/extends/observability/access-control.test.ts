import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { isDevUiEnabled } from '@/lib/extends/observability/access-control';

describe('isDevUiEnabled', () => {
  const prevDevUi = process.env.AI_TRACE_DEV_UI;
  const prevNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (prevDevUi === undefined) delete process.env.AI_TRACE_DEV_UI;
    else process.env.AI_TRACE_DEV_UI = prevDevUi;
    process.env.NODE_ENV = prevNodeEnv;
  });

  test('AI_TRACE_DEV_UI=1 forces enabled', () => {
    process.env.AI_TRACE_DEV_UI = '1';
    process.env.NODE_ENV = 'production';
    expect(isDevUiEnabled()).toBe(true);
  });

  test('AI_TRACE_DEV_UI=0 forces disabled', () => {
    process.env.AI_TRACE_DEV_UI = '0';
    process.env.NODE_ENV = 'development';
    expect(isDevUiEnabled()).toBe(false);
  });

  test('defaults to enabled outside production', () => {
    delete process.env.AI_TRACE_DEV_UI;
    process.env.NODE_ENV = 'development';
    expect(isDevUiEnabled()).toBe(true);
  });

  test('defaults to disabled in production', () => {
    delete process.env.AI_TRACE_DEV_UI;
    process.env.NODE_ENV = 'production';
    expect(isDevUiEnabled()).toBe(false);
  });
});
