/**
 * @extends-from tests/teacher/course-project.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, test } from 'vitest';
import type { SceneOutline } from '@/lib/types/generation';
import {
  applyGeneratedChapterScenes,
  createCourseProject,
  createOutlineFromSceneOutlines,
  markChapterDirty,
  listRegeneratableOutlines,
} from '@/lib/teacher/course-project';
import type { Scene } from '@/lib/types/stage';

const outlines: SceneOutline[] = [
  {
    id: 's1',
    type: 'slide',
    title: 'Intro',
    description: 'Intro page',
    keyPoints: ['A'],
    order: 0,
    teachingObjective: 'Understand force basics',
  },
  {
    id: 'q1',
    type: 'quiz',
    title: 'Check',
    description: 'Check understanding',
    keyPoints: ['A'],
    order: 1,
    quizConfig: { questionCount: 2, difficulty: 'easy', questionTypes: ['single'] },
  },
];

const multiChapterOutlines: SceneOutline[] = Array.from({ length: 5 }, (_, index) => ({
  id: `s${index + 1}`,
  type: 'slide',
  title: `Scene ${index + 1}`,
  description: `Scene ${index + 1} description`,
  keyPoints: [`Point ${index + 1}`],
  order: index,
}));

const generatedScenes: Scene[] = [
  {
    id: 'scene_slide',
    stageId: 'teacher_1',
    type: 'slide',
    title: 'Intro',
    order: 0,
    content: {
      type: 'slide',
      canvas: {
        id: 'slide_1',
        viewportSize: 1000,
        viewportRatio: 0.5625,
        theme: {
          backgroundColor: '#ffffff',
          themeColors: ['#5b9bd5'],
          fontColor: '#333333',
          fontName: 'Microsoft YaHei',
        },
        elements: [],
        background: { type: 'solid', color: '#ffffff' },
      },
    },
  },
  {
    id: 'scene_quiz',
    stageId: 'teacher_1',
    type: 'quiz',
    title: 'Check',
    order: 1,
    content: {
      type: 'quiz',
      questions: [],
    },
  },
];

describe('teacher course project helpers', () => {
  test('creates a draft project with standard workflow', () => {
    const project = createCourseProject({
      id: 'teacher_1',
      title: 'Physics',
      requirement: 'Teach force',
      now: '2026-05-14T00:00:00.000Z',
    });

    expect(project).toMatchObject({
      id: 'teacher_1',
      title: 'Physics',
      status: 'draft',
      workflowTemplateId: 'standard-course',
      chapterCount: 0,
    });
  });

  test('groups scene outlines into editable chapters', () => {
    const outline = createOutlineFromSceneOutlines({
      projectId: 'teacher_1',
      sceneOutlines: outlines,
      chapterCount: 1,
      revision: 1,
    });

    expect(outline.chapters).toHaveLength(1);
    expect(outline.chapters[0]).toMatchObject({
      title: 'Intro',
      learningObjectives: ['Understand force basics'],
      status: 'draft',
      dirty: false,
      locked: false,
      order: 0,
    });
    expect(outline.chapters[0]!.sceneOutlines.map((scene) => scene.id)).toEqual(['s1', 'q1']);
  });

  test('splits multi-chapter outlines into continuous ordered groups', () => {
    const evenOutline = createOutlineFromSceneOutlines({
      projectId: 'teacher_1',
      sceneOutlines: multiChapterOutlines.slice(0, 4),
      chapterCount: 2,
      revision: 1,
    });

    expect(
      evenOutline.chapters.map((chapter) => chapter.sceneOutlines.map((scene) => scene.id)),
    ).toEqual([
      ['s1', 's2'],
      ['s3', 's4'],
    ]);

    const unevenOutline = createOutlineFromSceneOutlines({
      projectId: 'teacher_1',
      sceneOutlines: multiChapterOutlines,
      chapterCount: 2,
      revision: 1,
    });

    expect(
      unevenOutline.chapters.map((chapter) => chapter.sceneOutlines.map((scene) => scene.id)),
    ).toEqual([
      ['s1', 's2', 's3'],
      ['s4', 's5'],
    ]);
  });

  test('dirty chapters regenerate only unlocked outlines', () => {
    const outline = createOutlineFromSceneOutlines({
      projectId: 'teacher_1',
      sceneOutlines: outlines,
      chapterCount: 1,
      revision: 1,
    });
    const dirty = markChapterDirty(outline, outline.chapters[0]!.id);
    expect(listRegeneratableOutlines(dirty).map((scene) => scene.id)).toEqual(['s1', 'q1']);
  });

  test('locked dirty chapters are excluded from regeneratable outlines', () => {
    const outline = createOutlineFromSceneOutlines({
      projectId: 'teacher_1',
      sceneOutlines: outlines,
      chapterCount: 1,
      revision: 1,
    });
    const lockedDirty = {
      ...outline,
      chapters: outline.chapters.map((chapter) => ({
        ...chapter,
        dirty: true,
        locked: true,
      })),
    };

    expect(listRegeneratableOutlines(lockedDirty)).toEqual([]);
  });

  test('applies generated chapter scenes to chapter status and artifacts', () => {
    const outline = createOutlineFromSceneOutlines({
      projectId: 'teacher_1',
      sceneOutlines: outlines,
      chapterCount: 1,
      revision: 2,
    });
    const dirtyOutline = markChapterDirty(outline, outline.chapters[0]!.id);
    const project = {
      ...createCourseProject({
        id: 'teacher_1',
        title: 'Physics',
        requirement: 'Teach force',
        now: '2026-05-14T00:00:00.000Z',
      }),
      outline: dirtyOutline,
      artifacts: [
        {
          chapterId: dirtyOutline.chapters[0]!.id,
          sceneId: 'old_scene',
          sceneType: 'slide' as const,
          sourceOutlineId: 'old_outline',
          outlineRevision: 1,
          locked: false,
          lastGeneratedAt: '2026-05-13T00:00:00.000Z',
        },
      ],
    };
    const updatedProject = applyGeneratedChapterScenes({
      project,
      chapterId: dirtyOutline.chapters[0]!.id,
      scenes: generatedScenes,
      generatedAt: '2026-05-14T01:00:00.000Z',
    });

    expect(updatedProject.status).toBe('editing');
    expect(updatedProject.updatedAt).toBe('2026-05-14T01:00:00.000Z');
    expect(updatedProject.outline?.chapters[0]).toMatchObject({
      status: 'ready',
      dirty: false,
    });
    expect(updatedProject.artifacts).toEqual([
      {
        chapterId: dirtyOutline.chapters[0]!.id,
        sceneId: 'scene_slide',
        sceneType: 'slide',
        sourceOutlineId: 's1',
        outlineRevision: 2,
        locked: false,
        lastGeneratedAt: '2026-05-14T01:00:00.000Z',
      },
      {
        chapterId: dirtyOutline.chapters[0]!.id,
        sceneId: 'scene_quiz',
        sceneType: 'quiz',
        sourceOutlineId: 'q1',
        outlineRevision: 2,
        locked: false,
        lastGeneratedAt: '2026-05-14T01:00:00.000Z',
      },
    ]);
    expect(updatedProject.generatedScenes).toEqual(generatedScenes);
    expect(updatedProject.run).toEqual({
      step: 'idle',
      progress: 100,
      message: 'Chapter generated',
    });
  });

  test('rejects generated scenes for locked chapters without changing the project', () => {
    const outline = createOutlineFromSceneOutlines({
      projectId: 'teacher_1',
      sceneOutlines: outlines,
      chapterCount: 1,
      revision: 2,
    });
    const lockedOutline = {
      ...outline,
      chapters: outline.chapters.map((chapter) => ({
        ...chapter,
        locked: true,
        dirty: true,
        status: 'dirty' as const,
      })),
    };
    const project = {
      ...createCourseProject({
        id: 'teacher_1',
        title: 'Physics',
        requirement: 'Teach force',
        now: '2026-05-14T00:00:00.000Z',
      }),
      outline: lockedOutline,
    };
    const originalProject = structuredClone(project);

    expect(() =>
      applyGeneratedChapterScenes({
        project,
        chapterId: lockedOutline.chapters[0]!.id,
        scenes: generatedScenes,
        generatedAt: '2026-05-14T01:00:00.000Z',
      }),
    ).toThrow(/locked chapter/i);
    expect(project).toEqual(originalProject);
  });

  test('rejects generated scenes when the chapter has locked artifacts', () => {
    const outline = createOutlineFromSceneOutlines({
      projectId: 'teacher_1',
      sceneOutlines: outlines,
      chapterCount: 1,
      revision: 2,
    });
    const dirtyOutline = markChapterDirty(outline, outline.chapters[0]!.id);
    const lockedArtifact = {
      chapterId: dirtyOutline.chapters[0]!.id,
      sceneId: 'locked_scene',
      sceneType: 'slide' as const,
      sourceOutlineId: 's1',
      outlineRevision: 1,
      locked: true,
      lastGeneratedAt: '2026-05-13T00:00:00.000Z',
    };
    const project = {
      ...createCourseProject({
        id: 'teacher_1',
        title: 'Physics',
        requirement: 'Teach force',
        now: '2026-05-14T00:00:00.000Z',
      }),
      outline: dirtyOutline,
      artifacts: [lockedArtifact],
      generatedScenes: [generatedScenes[0]!],
    };
    const originalProject = structuredClone(project);

    expect(() =>
      applyGeneratedChapterScenes({
        project,
        chapterId: dirtyOutline.chapters[0]!.id,
        scenes: generatedScenes,
        generatedAt: '2026-05-14T01:00:00.000Z',
      }),
    ).toThrow(/locked artifact/i);
    expect(project).toEqual(originalProject);
  });

  test('rejects incomplete generated scenes without marking the chapter ready', () => {
    const outline = createOutlineFromSceneOutlines({
      projectId: 'teacher_1',
      sceneOutlines: outlines,
      chapterCount: 1,
      revision: 2,
    });
    const dirtyOutline = markChapterDirty(outline, outline.chapters[0]!.id);
    const project = {
      ...createCourseProject({
        id: 'teacher_1',
        title: 'Physics',
        requirement: 'Teach force',
        now: '2026-05-14T00:00:00.000Z',
      }),
      outline: dirtyOutline,
    };
    const originalProject = structuredClone(project);

    expect(() =>
      applyGeneratedChapterScenes({
        project,
        chapterId: dirtyOutline.chapters[0]!.id,
        scenes: generatedScenes.slice(0, 1),
        generatedAt: '2026-05-14T01:00:00.000Z',
      }),
    ).toThrow(/expected 2 generated scenes/i);
    expect(project).toEqual(originalProject);
  });
});
