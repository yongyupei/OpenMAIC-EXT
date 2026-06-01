/**
 * @extends-from tests/knowledge-base/file-types.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, test } from 'vitest';
import {
  getKnowledgeFileCategory,
  isKnowledgeFileAllowed,
  isKnowledgeLegacyFormat,
  KNOWLEDGE_FILE_ACCEPT,
} from '@/lib/knowledge-base/file-types';

describe('isKnowledgeFileAllowed', () => {
  test('allows pdf and html', () => {
    expect(isKnowledgeFileAllowed('a.pdf')).toBe(true);
    expect(isKnowledgeFileAllowed('page.html', 'text/html')).toBe(true);
  });
  test('allows common images', () => {
    expect(isKnowledgeFileAllowed('photo.png', 'image/png')).toBe(true);
  });
  test('rejects unknown ext', () => {
    expect(isKnowledgeFileAllowed('virus.exe')).toBe(false);
  });
});

describe('isKnowledgeLegacyFormat', () => {
  test('flags .doc', () => {
    expect(isKnowledgeLegacyFormat('old.doc')).toBe(true);
  });
});

describe('getKnowledgeFileCategory', () => {
  test('categorizes html and image', () => {
    expect(getKnowledgeFileCategory('x.html')).toBe('html');
    expect(getKnowledgeFileCategory('x.png')).toBe('image');
  });
});
