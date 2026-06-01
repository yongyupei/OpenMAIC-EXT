/**
 * @extends-from lib/teacher/chapter-classroom-ui.ts
 * @fork-branch feat/ai-runtime-observability
 */
import type {
  CourseChapterClassroom,
  CourseChapterClassroomFailedStep,
  CourseChapterClassroomStatus,
} from '@/lib/teacher/course-types';

export interface ChapterClassroomUiState {
  readonly status: CourseChapterClassroomStatus;
  readonly failedReason?: string;
  readonly failedStep?: CourseChapterClassroomFailedStep;
  readonly sceneCount?: number;
  readonly lastTraceId?: string;
}

export function chapterClassroomToUiState(
  classroom: CourseChapterClassroom | null | undefined,
): ChapterClassroomUiState | undefined {
  if (!classroom) return undefined;
  return {
    status: classroom.status,
    failedReason: classroom.failedReason,
    failedStep: classroom.failedStep,
    sceneCount: classroom.sceneCount,
    lastTraceId: classroom.lastTraceId,
  };
}

export function chapterClassroomsToUiMap(
  chapterClassrooms: Record<string, CourseChapterClassroom> | undefined,
): Record<string, ChapterClassroomUiState> {
  const map: Record<string, ChapterClassroomUiState> = {};
  if (!chapterClassrooms) return map;
  for (const [chapterId, classroom] of Object.entries(chapterClassrooms)) {
    const ui = chapterClassroomToUiState(classroom);
    if (ui) map[chapterId] = ui;
  }
  return map;
}
