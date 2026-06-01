/**
 * @extends-from lib/teacher/chapter-classroom-api.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import type { CourseChapterClassroom } from '@/lib/teacher/course-types';

export type { CourseChapterClassroom };

export interface ChapterClassroomApiPayload {
  chapterClassroom?: CourseChapterClassroom | null;
}

/** Reads chapterClassroom from teacher chapter GET responses (flat or legacy `data` wrapper). */
export function parseChapterClassroomPayload(
  json: unknown,
): CourseChapterClassroom | null | undefined {
  if (!json || typeof json !== 'object') return undefined;
  const record = json as Record<string, unknown>;
  if (record.chapterClassroom !== undefined) {
    return record.chapterClassroom as CourseChapterClassroom | null;
  }
  const data = record.data;
  if (data && typeof data === 'object') {
    return (data as ChapterClassroomApiPayload).chapterClassroom;
  }
  return undefined;
}

export function parseChapterClassroomStatus(
  json: unknown,
): CourseChapterClassroom['status'] | undefined {
  return parseChapterClassroomPayload(json)?.status;
}

export function parseChapterClassroomFailedReason(json: unknown): string | undefined {
  const reason = parseChapterClassroomPayload(json)?.failedReason;
  return typeof reason === 'string' && reason.trim() ? reason.trim() : undefined;
}

export function parseChapterClassroomFailedStep(
  json: unknown,
): CourseChapterClassroom['failedStep'] | undefined {
  const step = parseChapterClassroomPayload(json)?.failedStep;
  return step === 'outline' || step === 'scenes' ? step : undefined;
}

const GENERATION_STEP_VALUES = new Set<CourseChapterClassroom['generationStep']>([
  'outline',
  'scene-content',
  'scene-actions',
  'media',
  'tts',
  'persist',
]);

export function parseChapterClassroomGenerationStep(
  json: unknown,
): CourseChapterClassroom['generationStep'] | undefined {
  const step = parseChapterClassroomPayload(json)?.generationStep;
  return step && GENERATION_STEP_VALUES.has(step) ? step : undefined;
}

/** Marks the chapter classroom as generating before navigating to the generate page. */
export async function markChapterClassroomGenerating(
  projectId: string,
  chapterId: string,
): Promise<CourseChapterClassroom | null> {
  const res = await fetch(
    `/api/extends/teacher/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start-generation' }),
    },
  );
  if (!res.ok) return null;
  const json: unknown = await res.json();
  return parseChapterClassroomPayload(json) ?? null;
}

export function parseTeacherApiErrorMessage(json: unknown, fallback: string): string {
  if (!json || typeof json !== 'object') return fallback;
  const record = json as { error?: string; details?: string };
  if (typeof record.details === 'string' && record.details.trim()) return record.details.trim();
  if (typeof record.error === 'string' && record.error.trim()) return record.error.trim();
  return fallback;
}
