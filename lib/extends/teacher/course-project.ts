/**
 * @extends-from lib/teacher/course-project.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { nanoid } from 'nanoid';
import type { SceneOutline, UserRequirements } from '@/lib/types/generation';
import type { Scene } from '@/lib/types/stage';
import type {
  CourseChapter,
  CourseChapterClassroom,
  CourseOutline,
  CourseProject,
} from '@/lib/teacher/course-types';

export interface CreateCourseProjectInput {
  id: string;
  title?: string;
  requirement?: string;
  overview?: string;
  chapters?: Array<{
    title: string;
    learningObjectives: string[];
    summary?: string;
  }>;
  targetAudience?: string;
  durationMinutes?: number;
  now: string;
}

const DEFAULT_TITLE = 'Untitled course';

export function createCourseProject(input: CreateCourseProjectInput): CourseProject {
  const overview = input.overview?.trim() ?? '';
  const requirement = input.requirement?.trim() || overview;
  if (!requirement) {
    throw new Error('requirement or overview must be provided');
  }
  const requirements: UserRequirements = { requirement };
  const title = (input.title?.trim() || deriveTitleFromOverview(overview) || DEFAULT_TITLE).slice(
    0,
    120,
  );
  const chapters: CourseChapter[] = (input.chapters ?? []).map((chapter, index) => ({
    id: nanoid(),
    title: chapter.title.trim().slice(0, 200),
    learningObjectives: chapter.learningObjectives.map((line) => line.trim()).filter(Boolean),
    summary: chapter.summary?.trim() ?? '',
    referenceFiles: [],
    deepSearchEnabled: false,
    sceneOutlines: [],
    status: 'draft',
    dirty: false,
    locked: false,
    order: index,
  }));
  const outline: CourseOutline | undefined =
    chapters.length > 0 ? { projectId: input.id, revision: 1, chapters } : undefined;
  return {
    id: input.id,
    title,
    requirements,
    overview,
    targetAudience: input.targetAudience,
    durationMinutes: input.durationMinutes,
    chapterCount: chapters.length,
    workflowTemplateId: 'standard-course',
    status: 'draft',
    createdAt: input.now,
    updatedAt: input.now,
    outline,
    artifacts: [],
  };
}

function deriveTitleFromOverview(overview: string): string {
  if (!overview) return '';
  const firstLine = overview.split(/[\n。.！!？?]/)[0]?.trim() ?? '';
  return firstLine.slice(0, 30);
}

export function createOutlineFromSceneOutlines(input: {
  projectId: string;
  sceneOutlines: SceneOutline[];
  chapterCount: number;
  revision: number;
  languageDirective?: string;
}): CourseOutline {
  const chapterCount = Math.max(1, input.chapterCount);
  const baseSize = Math.floor(input.sceneOutlines.length / chapterCount);
  const remainder = input.sceneOutlines.length % chapterCount;
  const chapters = Array.from({ length: chapterCount }, (_, index) => {
    const start = index * baseSize + Math.min(index, remainder);
    const size = baseSize + (index < remainder ? 1 : 0);
    const sceneOutlines = input.sceneOutlines.slice(start, start + size);
    return {
      id: nanoid(),
      title: sceneOutlines[0]?.title ?? `Chapter ${index + 1}`,
      learningObjectives: sceneOutlines.flatMap((outline) =>
        outline.teachingObjective ? [outline.teachingObjective] : [],
      ),
      sceneOutlines,
      status: 'draft' as const,
      dirty: false,
      locked: false,
      order: index,
    };
  });
  return {
    projectId: input.projectId,
    languageDirective: input.languageDirective,
    revision: input.revision,
    chapters,
  };
}

export function markChapterDirty(outline: CourseOutline, chapterId: string): CourseOutline {
  return {
    ...outline,
    chapters: outline.chapters.map((chapter) =>
      chapter.id === chapterId ? { ...chapter, dirty: true, status: 'dirty' } : chapter,
    ),
  };
}

export function listRegeneratableOutlines(outline: CourseOutline): SceneOutline[] {
  return outline.chapters
    .filter((chapter) => chapter.dirty && !chapter.locked)
    .flatMap((chapter) => chapter.sceneOutlines);
}

export function applyGeneratedChapterScenes(input: {
  project: CourseProject;
  chapterId: string;
  scenes: Scene[];
  generatedAt: string;
}): CourseProject {
  const outline = input.project.outline;
  if (!outline) {
    throw new Error('Project outline is required to apply generated chapter scenes');
  }

  const chapter = outline.chapters.find((candidate) => candidate.id === input.chapterId);
  if (!chapter) {
    throw new Error(`Chapter not found: ${input.chapterId}`);
  }

  if (chapter.locked) {
    throw new Error(`Cannot apply generated scenes to locked chapter: ${input.chapterId}`);
  }

  if (input.scenes.length < chapter.sceneOutlines.length) {
    throw new Error(
      `Expected ${chapter.sceneOutlines.length} generated scenes for chapter ${input.chapterId}, received ${input.scenes.length}`,
    );
  }

  const chapterArtifacts = input.project.artifacts.filter(
    (artifact) => artifact.chapterId === input.chapterId,
  );
  const lockedArtifact = chapterArtifacts.find((artifact) => artifact.locked);
  if (lockedArtifact) {
    throw new Error(`Cannot replace locked artifact: ${lockedArtifact.sceneId}`);
  }

  const generatedArtifacts = input.scenes.map((scene, index) => {
    const sourceOutline = chapter.sceneOutlines[index];
    if (!sourceOutline) {
      throw new Error(`Scene outline not found for generated scene: ${scene.id}`);
    }

    return {
      chapterId: input.chapterId,
      sceneId: scene.id,
      sceneType: scene.type,
      sourceOutlineId: sourceOutline.id,
      outlineRevision: outline.revision,
      locked: false,
      lastGeneratedAt: input.generatedAt,
    };
  });
  const replacedSceneIds = new Set(chapterArtifacts.map((artifact) => artifact.sceneId));

  return {
    ...input.project,
    status: 'editing',
    updatedAt: input.generatedAt,
    run: {
      step: 'idle',
      progress: 100,
      message: 'Chapter generated',
    },
    outline: {
      ...outline,
      chapters: outline.chapters.map((candidate) =>
        candidate.id === input.chapterId
          ? { ...candidate, status: 'ready', dirty: false }
          : candidate,
      ),
    },
    artifacts: [
      ...input.project.artifacts.filter((artifact) => artifact.chapterId !== input.chapterId),
      ...generatedArtifacts,
    ],
    generatedScenes: [
      ...(input.project.generatedScenes ?? []).filter((scene) => !replacedSceneIds.has(scene.id)),
      ...input.scenes,
    ],
  };
}

/**
 * Returns a new CourseProject with the given chapter classroom record applied.
 * Deep-merges chapterClassrooms to avoid overwriting sibling chapter entries.
 * Transitions project status to 'editing' when a chapter becomes ready and the project is still in draft/outlining state.
 */
/** Clears failure fields and marks a chapter classroom as generating (design workbench retry). */
export function buildChapterClassroomGeneratingReset(
  chapterId: string,
  classroomId: string,
  previous?: CourseChapterClassroom,
): CourseChapterClassroom {
  const now = new Date().toISOString();
  return {
    chapterId,
    classroomId,
    status: 'generating',
    sceneCount: previous?.sceneCount,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  };
}

export function applyChapterClassroomUpdate(
  project: CourseProject,
  chapterClassroom: CourseChapterClassroom,
): CourseProject {
  const now = new Date().toISOString();
  const shouldTransitionToEditing =
    chapterClassroom.status === 'ready' &&
    (project.status === 'draft' || project.status === 'outlining');
  return {
    ...project,
    status: shouldTransitionToEditing ? 'editing' : project.status,
    updatedAt: now,
    chapterClassrooms: {
      ...project.chapterClassrooms,
      [chapterClassroom.chapterId]: chapterClassroom,
    },
  };
}
