/**
 * @extends-from lib/teacher/chapter-reference-client.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import type { ChapterReferenceFile } from '@/lib/teacher/course-types';

export async function uploadChapterReference(
  projectId: string,
  chapterId: string,
  file: File,
): Promise<ChapterReferenceFile> {
  const form = new FormData();
  form.append('file', file, file.name);

  const response = await fetch(
    `/api/extends/teacher/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/references`,
    { method: 'POST', body: form },
  );
  const json = (await response.json()) as {
    success?: boolean;
    referenceFile?: ChapterReferenceFile;
    error?: string;
    details?: string;
  };
  if (!response.ok || !json.success || !json.referenceFile) {
    throw new Error(json.details ?? json.error ?? `Upload failed: HTTP ${response.status}`);
  }
  return json.referenceFile;
}

export async function deleteChapterReference(
  projectId: string,
  chapterId: string,
  fileId: string,
): Promise<void> {
  const response = await fetch(
    `/api/extends/teacher/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/references?fileId=${encodeURIComponent(fileId)}`,
    { method: 'DELETE' },
  );
  const json = (await response.json()) as { success?: boolean; error?: string; details?: string };
  if (!response.ok || !json.success) {
    throw new Error(json.details ?? json.error ?? `Delete failed: HTTP ${response.status}`);
  }
}
