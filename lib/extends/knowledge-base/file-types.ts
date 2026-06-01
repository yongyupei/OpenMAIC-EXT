/**
 * @extends-from lib/knowledge-base/file-types.ts
 * @fork-branch feat/html-slide-design-workbench
 */
/** Knowledge base upload allowlist — extends chapter reference types. */

import type { KnowledgeFileCategory } from '@/lib/knowledge-base/types';
import {
  CHAPTER_REFERENCE_ACCEPT,
  getChapterReferenceCategory,
  isChapterReferenceFileAllowed,
  isChapterReferenceLegacyFormat,
} from '@/lib/teacher/chapter-reference-file-types';

const KNOWLEDGE_EXTRA_EXTENSIONS = new Set([
  'html',
  'htm',
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'zip',
  'mp3',
  'mp4',
  'wav',
]);

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const MEDIA_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'video/mp4',
]);

export const KNOWLEDGE_FILE_ACCEPT =
  CHAPTER_REFERENCE_ACCEPT +
  ',.html,.htm,.jpg,.jpeg,.png,.webp,.gif,.zip,.mp3,.mp4,.wav,' +
  'text/html,image/jpeg,image/png,image/webp,image/gif,application/zip,application/x-zip-compressed,' +
  'audio/mpeg,audio/mp3,audio/wav,audio/x-wav,video/mp4';

function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  if (dot < 0) return '';
  return fileName.slice(dot + 1).toLowerCase();
}

export function isKnowledgeLegacyFormat(fileName: string): boolean {
  return isChapterReferenceLegacyFormat(fileName);
}

export function isKnowledgeFileAllowed(fileName: string, mimeType = ''): boolean {
  if (isChapterReferenceFileAllowed(fileName, mimeType)) return true;

  const ext = fileExtension(fileName);
  if (ext && KNOWLEDGE_EXTRA_EXTENSIONS.has(ext)) return true;

  const type = mimeType.toLowerCase();
  if (!type) return false;
  if (type === 'text/html') return true;
  if (IMAGE_MIME_TYPES.has(type)) return true;
  if (type === 'application/zip' || type === 'application/x-zip-compressed') return true;
  if (MEDIA_MIME_TYPES.has(type)) return true;
  return false;
}

export function getKnowledgeFileCategory(fileName: string): KnowledgeFileCategory {
  const chapterCategory = getChapterReferenceCategory(fileName);
  if (chapterCategory !== 'unknown') return chapterCategory;

  const ext = fileExtension(fileName);
  if (ext === 'html' || ext === 'htm') return 'html';
  if (ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'webp' || ext === 'gif') {
    return 'image';
  }
  if (ext === 'zip') return 'archive';
  if (ext === 'mp3' || ext === 'mp4' || ext === 'wav') return 'media';
  return 'unknown';
}
