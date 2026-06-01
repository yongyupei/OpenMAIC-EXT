/**
 * @extends-from tests/teacher/preview-binding.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  clearTeacherPreviewBinding,
  readTeacherPreviewBinding,
  updateTeacherPreviewGenParams,
  writeTeacherPreviewBinding,
} from '@/lib/teacher/preview-binding';

const sessionStore = new Map<string, string>();

beforeAll(() => {
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => sessionStore.get(key) ?? null,
      setItem: (key: string, value: string) => {
        sessionStore.set(key, value);
      },
      removeItem: (key: string) => {
        sessionStore.delete(key);
      },
      clear: () => {
        sessionStore.clear();
      },
      key: () => '',
      get length() {
        return sessionStore.size;
      },
    } as Storage,
    writable: true,
  });
});

describe('preview-binding', () => {
  beforeEach(() => {
    sessionStore.clear();
  });

  afterEach(() => {
    sessionStore.clear();
  });

  test('round-trip read/write', () => {
    writeTeacherPreviewBinding('proj-1', 'ch-a', 'stage-x', { languageDirective: 'en' });
    const read = readTeacherPreviewBinding('proj-1', 'ch-a');
    expect(read).toEqual({
      version: 1,
      projectId: 'proj-1',
      chapterKey: 'ch-a',
      stageId: 'stage-x',
      genParams: { languageDirective: 'en' },
    });
  });

  test('__all__ chapter when chapterId omitted', () => {
    writeTeacherPreviewBinding('p2', undefined, 's2');
    expect(readTeacherPreviewBinding('p2', undefined)?.chapterKey).toBe('__all__');
  });

  test('returns null for wrong projectId', () => {
    writeTeacherPreviewBinding('p', undefined, 's');
    expect(readTeacherPreviewBinding('other', undefined)).toBeNull();
  });

  test('clear removes binding', () => {
    writeTeacherPreviewBinding('p3', 'c1', 's3');
    clearTeacherPreviewBinding('p3', 'c1');
    expect(readTeacherPreviewBinding('p3', 'c1')).toBeNull();
  });

  test('updateTeacherPreviewGenParams merges', () => {
    writeTeacherPreviewBinding('p4', undefined, 's4', { languageDirective: 'a' });
    updateTeacherPreviewGenParams('p4', undefined, { userProfile: 'u' });
    expect(readTeacherPreviewBinding('p4', undefined)?.genParams).toEqual({
      languageDirective: 'a',
      userProfile: 'u',
    });
  });

  test('update is no-op when binding missing', () => {
    updateTeacherPreviewGenParams('missing', undefined, { languageDirective: 'x' });
    expect(readTeacherPreviewBinding('missing', undefined)).toBeNull();
  });
});
