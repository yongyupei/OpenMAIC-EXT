/**
 * @extends-from lib/teacher/chapter-reference-file-types.ts
 * @fork-branch feat/html-slide-design-workbench
 */
/** Shared allowlist for chapter reference uploads (client + server). */

export const CHAPTER_REFERENCE_ACCEPT =
  '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.markdown,' +
  'application/pdf,' +
  'application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,' +
  'application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,' +
  'application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,' +
  'text/plain,text/markdown';

const EXTENSIONS = new Set([
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'txt',
  'md',
  'markdown',
]);

/** Legacy OLE formats — upload allowed in picker but server rejects with a clear message. */
export const CHAPTER_REFERENCE_LEGACY_EXTENSIONS = new Set(['doc', 'xls', 'ppt']);

export type ChapterReferenceFileCategory =
  | 'pdf'
  | 'word'
  | 'excel'
  | 'powerpoint'
  | 'text'
  | 'unknown';

export function chapterReferenceExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  if (dot < 0) return '';
  return fileName.slice(dot + 1).toLowerCase();
}

export function getChapterReferenceCategory(fileName: string): ChapterReferenceFileCategory {
  const ext = chapterReferenceExtension(fileName);
  if (ext === 'pdf') return 'pdf';
  if (ext === 'doc' || ext === 'docx') return 'word';
  if (ext === 'xls' || ext === 'xlsx') return 'excel';
  if (ext === 'ppt' || ext === 'pptx') return 'powerpoint';
  if (ext === 'txt' || ext === 'md' || ext === 'markdown') return 'text';
  return 'unknown';
}

export function isChapterReferenceLegacyFormat(fileName: string): boolean {
  return CHAPTER_REFERENCE_LEGACY_EXTENSIONS.has(chapterReferenceExtension(fileName));
}

export function isChapterReferenceFileAllowed(fileName: string, mimeType = ''): boolean {
  const ext = chapterReferenceExtension(fileName);
  if (ext && EXTENSIONS.has(ext)) return true;

  const type = mimeType.toLowerCase();
  if (!type) return false;
  if (type === 'application/pdf') return true;
  if (type === 'text/plain' || type === 'text/markdown') return true;
  if (type.includes('wordprocessingml') || type === 'application/msword') return true;
  if (type.includes('spreadsheetml') || type === 'application/vnd.ms-excel') return true;
  if (type.includes('presentationml') || type === 'application/vnd.ms-powerpoint') return true;
  return false;
}

export function normalizeChapterReferenceMimeType(fileName: string, mimeType: string): string {
  const trimmed = mimeType.trim();
  if (trimmed) return trimmed;

  const ext = chapterReferenceExtension(fileName);
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain',
    md: 'text/markdown',
    markdown: 'text/markdown',
  };
  return map[ext] ?? 'application/octet-stream';
}
