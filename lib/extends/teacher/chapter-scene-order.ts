/**
 * @extends-from lib/teacher/chapter-scene-order.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import type { CourseProject } from '@/lib/teacher/course-types';
import type { Scene } from '@/lib/types/stage';

/** Chapter tabs + scene id ordering for the course editor (matches publish ordering). */
export interface CourseEditorChapterNavModel {
  readonly chapters: ReadonlyArray<{ readonly id: string; readonly title: string }>;
  readonly sceneIdsByChapterId: Readonly<Record<string, readonly string[]>>;
}

export function buildCourseEditorChapterNavFromProject(
  project: CourseProject,
): CourseEditorChapterNavModel | null {
  const sorted = getSortedOutlineChapters(project);
  if (sorted.length === 0) return null;

  const sceneIdsByChapterId: Record<string, string[]> = {};
  for (const chapter of sorted) {
    sceneIdsByChapterId[chapter.id] = getSceneIdsForChapterInOrder(project, chapter.id);
  }

  return {
    chapters: sorted.map((chapter) => ({ id: chapter.id, title: chapter.title })),
    sceneIdsByChapterId,
  };
}

/** Scene ids for a chapter in outline order (scene outline → artifact → scene). */
export function getSceneIdsForChapterInOrder(project: CourseProject, chapterId: string): string[] {
  const outline = project.outline;
  if (!outline) return [];

  const chapter = outline.chapters.find((candidate) => candidate.id === chapterId);
  if (!chapter) return [];

  const artifactsByOutlineId = new Map(
    project.artifacts.map((artifact) => [artifact.sourceOutlineId, artifact]),
  );

  const ids: string[] = [];
  for (const sceneOutline of chapter.sceneOutlines) {
    const artifact = artifactsByOutlineId.get(sceneOutline.id);
    if (artifact) ids.push(artifact.sceneId);
  }
  return ids;
}

export function getSceneById(project: CourseProject, sceneId: string): Scene | undefined {
  return (project.generatedScenes ?? []).find((scene) => scene.id === sceneId);
}

export function getSortedOutlineChapters(project: CourseProject) {
  const outline = project.outline;
  if (!outline) return [];
  return [...outline.chapters].sort((left, right) => left.order - right.order);
}

/**
 * Resolves the best scene ID to navigate to when the user clicks a chapter tab.
 *
 * Primary: finds the first artifact-mapped sceneId that actually exists in the
 * current store (guards against re-generation ID drift).
 * Fallback: estimates position by chapter index if no artifact IDs match.
 *
 * Returns null when no valid scene can be determined.
 */
export function resolveChapterTargetSceneId(
  chapterNav: CourseEditorChapterNavModel,
  chapterId: string,
  availableSceneIds: ReadonlySet<string>,
  sortedScenes: ReadonlyArray<{ readonly id: string }>,
): string | null {
  if (sortedScenes.length === 0 || chapterNav.chapters.length === 0) return null;

  // Primary path: first artifact sceneId that exists in the store
  const mappedIds = chapterNav.sceneIdsByChapterId[chapterId] ?? [];
  const validId = mappedIds.find((id) => availableSceneIds.has(id));
  if (validId !== undefined) return validId;

  // Fallback: estimate scene position by chapter order
  const chapterIndex = chapterNav.chapters.findIndex((c) => c.id === chapterId);
  if (chapterIndex < 0) return null;

  const scenesPerChapter = Math.ceil(sortedScenes.length / chapterNav.chapters.length);
  const estimatedIdx = Math.min(chapterIndex * scenesPerChapter, sortedScenes.length - 1);
  return sortedScenes[estimatedIdx]?.id ?? null;
}
