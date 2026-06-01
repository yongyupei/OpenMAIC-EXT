/**
 * @extends-from tests/teacher/chapter-reference-file-types.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, it } from 'vitest';

import {
  getChapterReferenceCategory,
  isChapterReferenceFileAllowed,
  isChapterReferenceLegacyFormat,
} from '@/lib/teacher/chapter-reference-file-types';

describe('chapter-reference-file-types', () => {
  it('allows common reference extensions', () => {
    expect(isChapterReferenceFileAllowed('notes.pdf')).toBe(true);
    expect(isChapterReferenceFileAllowed('outline.docx')).toBe(true);
    expect(isChapterReferenceFileAllowed('data.xlsx')).toBe(true);
    expect(isChapterReferenceFileAllowed('slides.pptx')).toBe(true);
    expect(isChapterReferenceFileAllowed('readme.md')).toBe(true);
    expect(isChapterReferenceFileAllowed('notes.txt')).toBe(true);
    expect(isChapterReferenceFileAllowed('diagram.png', 'image/png')).toBe(false);
  });

  it('rejects unknown extensions', () => {
    expect(isChapterReferenceFileAllowed('archive.zip')).toBe(false);
  });

  it('flags legacy office formats', () => {
    expect(isChapterReferenceLegacyFormat('legacy.doc')).toBe(true);
    expect(isChapterReferenceLegacyFormat('legacy.docx')).toBe(false);
  });

  it('categorizes files', () => {
    expect(getChapterReferenceCategory('a.pdf')).toBe('pdf');
    expect(getChapterReferenceCategory('b.docx')).toBe('word');
    expect(getChapterReferenceCategory('c.xlsx')).toBe('excel');
    expect(getChapterReferenceCategory('d.pptx')).toBe('powerpoint');
    expect(getChapterReferenceCategory('e.png')).toBe('unknown');
    expect(getChapterReferenceCategory('f.md')).toBe('text');
  });
});
