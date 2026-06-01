import { describe, expect, test } from 'vitest';
import { parseSinceToMs } from '@/lib/extends/observability/parse-since';

describe('parseSinceToMs', () => {
  test('parses relative hours', () => {
    const now = Date.now();
    const ms = parseSinceToMs('2h');
    expect(ms).not.toBeNull();
    expect(Number.isNaN(ms)).toBe(false);
    expect(now - ms!).toBeGreaterThan(2 * 3_600_000 - 5000);
  });

  test('returns null for empty', () => {
    expect(parseSinceToMs(null)).toBeNull();
    expect(parseSinceToMs('')).toBeNull();
  });

  test('returns NaN for invalid', () => {
    expect(Number.isNaN(parseSinceToMs('bogus')!)).toBe(true);
  });
});
