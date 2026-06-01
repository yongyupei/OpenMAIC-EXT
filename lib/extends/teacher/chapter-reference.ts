/**
 * @extends-from lib/teacher/chapter-reference.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { promises as fs } from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';

import { createLogger } from '@/lib/logger';
import { extractChapterReferenceText } from '@/lib/teacher/chapter-reference-extract';
import {
  isChapterReferenceFileAllowed,
  isChapterReferenceLegacyFormat,
  normalizeChapterReferenceMimeType,
} from '@/lib/teacher/chapter-reference-file-types';
import { TEACHER_PROJECTS_DIR } from '@/lib/teacher/course-project-storage';
import type {
  ChapterReferenceFile,
  CourseChapter,
  CourseProject,
} from '@/lib/teacher/course-types';

const log = createLogger('ChapterReference');

export const CHAPTER_REFERENCE_MAX_BYTES = 50 * 1024 * 1024;
export const CHAPTER_REFERENCE_MAX_FILES = 5;

export function chapterReferenceStorageDir(projectId: string, chapterId: string): string {
  return path.join(TEACHER_PROJECTS_DIR, projectId, 'chapter-references', chapterId);
}

export function chapterReferenceFilePath(
  projectId: string,
  chapterId: string,
  fileId: string,
  fileName: string,
): string {
  const safeName = fileName.replace(/[^\w.\-()+\u4e00-\u9fff]/g, '_').slice(0, 120);
  return path.join(chapterReferenceStorageDir(projectId, chapterId), `${fileId}-${safeName}`);
}

export function findChapterInProject(
  project: CourseProject,
  chapterId: string,
): CourseChapter | undefined {
  return project.outline?.chapters.find((chapter) => chapter.id === chapterId);
}

export async function saveChapterReferenceUpload(
  projectId: string,
  chapterId: string,
  file: File | Blob,
  fileName: string,
  mimeType: string,
): Promise<ChapterReferenceFile> {
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength > CHAPTER_REFERENCE_MAX_BYTES) {
    throw new Error('Reference file too large');
  }
  if (!isChapterReferenceFileAllowed(fileName, mimeType)) {
    throw new Error('Unsupported reference file type');
  }
  if (isChapterReferenceLegacyFormat(fileName)) {
    throw new Error('Legacy Office format not supported; use DOCX, XLSX, or PPTX');
  }

  const id = nanoid(10);
  const diskPath = chapterReferenceFilePath(projectId, chapterId, id, fileName);
  await fs.mkdir(path.dirname(diskPath), { recursive: true });
  await fs.writeFile(diskPath, buffer);

  return {
    id,
    name: fileName,
    mimeType: normalizeChapterReferenceMimeType(fileName, mimeType),
    size: buffer.byteLength,
    uploadedAt: new Date().toISOString(),
  };
}

export async function deleteChapterReferenceFile(
  projectId: string,
  chapterId: string,
  fileId: string,
  fileName: string,
): Promise<void> {
  const diskPath = chapterReferenceFilePath(projectId, chapterId, fileId, fileName);
  try {
    await fs.unlink(diskPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

export async function readChapterReferenceText(
  projectId: string,
  chapter: CourseChapter,
  maxChars = 12_000,
): Promise<string | undefined> {
  const files = chapter.referenceFiles ?? [];
  if (files.length === 0) return undefined;

  const chunks: string[] = [];
  for (const ref of files) {
    try {
      const diskPath = chapterReferenceFilePath(projectId, chapter.id, ref.id, ref.name);
      const buffer = await fs.readFile(diskPath);
      const text = await extractChapterReferenceText(buffer, ref.name);
      if (text) {
        chunks.push(`### ${ref.name}\n${text}`);
      }
    } catch (error) {
      log.warn(`Failed to parse chapter reference "${ref.name}":`, error);
    }
  }

  if (chunks.length === 0) return undefined;
  const combined = chunks.join('\n\n');
  return combined.length > maxChars ? `${combined.slice(0, maxChars)}\n…` : combined;
}

/** @deprecated Use {@link readChapterReferenceText} */
export const readChapterReferencePdfText = readChapterReferenceText;
