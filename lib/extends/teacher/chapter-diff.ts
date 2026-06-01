/**
 * @extends-from lib/teacher/chapter-diff.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { nanoid } from 'nanoid';
import type { GenerationMode } from '@/lib/slide-templates/types';
import type { CourseChapter } from '@/lib/teacher/course-types';
import type { GenerationProfileOverride } from '@/lib/teacher/generation-profile';

export interface ChapterPatch {
  id: string;
  title: string;
  learningObjectives: string[];
  summary?: string;
  deepSearchEnabled?: boolean;
  knowledgeNodeIds?: string[];
  slideTemplateId?: string;
  generationMode?: GenerationMode;
  generationProfileOverride?: GenerationProfileOverride;
}

export interface ApplyChapterPatchesResult {
  chapters: CourseChapter[];
  idMapping: Record<string, string>;
  deletedIds: string[];
}

const TEMP_ID_PREFIXES = ['local-', 'ai-'] as const;

function isTempId(id: string): boolean {
  return TEMP_ID_PREFIXES.some((prefix) => id.startsWith(prefix));
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function shouldDirty(existing: CourseChapter, patch: ChapterPatch): boolean {
  if (existing.status !== 'ready') return false;
  if (existing.title !== patch.title) return true;
  const objectivesChanged =
    existing.learningObjectives.length !== patch.learningObjectives.length ||
    existing.learningObjectives.some((line, idx) => line !== patch.learningObjectives[idx]);
  if (objectivesChanged) return true;
  if ((existing.summary ?? '') !== (patch.summary ?? '')) return true;
  if ((existing.deepSearchEnabled ?? false) !== (patch.deepSearchEnabled ?? false)) return true;
  const existingKb = existing.knowledgeNodeIds ?? [];
  if (
    patch.knowledgeNodeIds !== undefined &&
    !arraysEqual(existingKb, patch.knowledgeNodeIds)
  ) {
    return true;
  }
  if (
    patch.generationMode !== undefined &&
    (existing.generationMode ?? undefined) !== patch.generationMode
  ) {
    return true;
  }
  if (
    patch.slideTemplateId !== undefined &&
    (existing.slideTemplateId ?? undefined) !== patch.slideTemplateId
  ) {
    return true;
  }
  return false;
}

export function applyChapterPatches(
  existing: CourseChapter[],
  patches: ChapterPatch[],
): ApplyChapterPatchesResult {
  const existingById = new Map(existing.map((chapter) => [chapter.id, chapter]));
  const idMapping: Record<string, string> = {};

  const chapters: CourseChapter[] = patches.map((patch, index) => {
    if (isTempId(patch.id)) {
      const realId = nanoid();
      idMapping[patch.id] = realId;
      return {
        id: realId,
        title: patch.title,
        learningObjectives: patch.learningObjectives,
        summary: patch.summary ?? '',
        referenceFiles: [],
        deepSearchEnabled: patch.deepSearchEnabled ?? false,
        knowledgeNodeIds: patch.knowledgeNodeIds ?? [],
        sceneOutlines: [],
        status: 'draft' as const,
        dirty: false,
        locked: false,
        order: index,
      };
    }

    const previous = existingById.get(patch.id);
    if (!previous) {
      const realId = nanoid();
      idMapping[patch.id] = realId;
      return {
        id: realId,
        title: patch.title,
        learningObjectives: patch.learningObjectives,
        summary: patch.summary ?? '',
        referenceFiles: [],
        deepSearchEnabled: patch.deepSearchEnabled ?? false,
        knowledgeNodeIds: patch.knowledgeNodeIds ?? [],
        sceneOutlines: [],
        status: 'draft' as const,
        dirty: false,
        locked: false,
        order: index,
      };
    }

    const dirty = shouldDirty(previous, patch);
    return {
      ...previous,
      title: patch.title,
      learningObjectives: patch.learningObjectives,
      summary: patch.summary ?? '',
      deepSearchEnabled: patch.deepSearchEnabled ?? previous.deepSearchEnabled ?? false,
      ...(patch.knowledgeNodeIds !== undefined
        ? { knowledgeNodeIds: patch.knowledgeNodeIds }
        : previous.knowledgeNodeIds !== undefined
          ? { knowledgeNodeIds: previous.knowledgeNodeIds }
          : {}),
      ...(patch.slideTemplateId !== undefined
        ? { slideTemplateId: patch.slideTemplateId }
        : previous.slideTemplateId !== undefined
          ? { slideTemplateId: previous.slideTemplateId }
          : {}),
      ...(patch.generationMode !== undefined
        ? { generationMode: patch.generationMode }
        : previous.generationMode !== undefined
          ? { generationMode: previous.generationMode }
          : {}),
      ...(patch.generationProfileOverride !== undefined
        ? { generationProfileOverride: patch.generationProfileOverride }
        : previous.generationProfileOverride !== undefined
          ? { generationProfileOverride: previous.generationProfileOverride }
          : {}),
      order: index,
      status: dirty ? 'dirty' : previous.status,
      dirty: dirty ? true : previous.dirty,
    };
  });

  const resultIds = new Set(chapters.map((chapter) => chapter.id));
  const deletedIds = existing
    .filter((chapter) => !resultIds.has(chapter.id))
    .map((chapter) => chapter.id);

  return { chapters, idMapping, deletedIds };
}
