/**
 * @extends-from tests/teacher/course-publish.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, test } from 'vitest';
import type { CourseProject } from '@/lib/teacher/course-types';
import type { Scene } from '@/lib/types/stage';
import {
  buildStageFromTeacherProject,
  getPublishableScenes,
  validateTeacherProjectPublishable,
} from '@/lib/teacher/course-publish';
import type { SceneOutline } from '@/lib/types/generation';

function expectPublishInvalid(result: ReturnType<typeof validateTeacherProjectPublishable>) {
  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error('Expected publish validation to fail');
  }
  return result;
}

const readyQuizOutline = {
  id: 'outline_1',
  title: 'Quiz',
  type: 'quiz',
  description: 'Check understanding',
  keyPoints: ['Force basics'],
  order: 0,
} satisfies SceneOutline;

const readyQuizScene = {
  id: 'scene_1',
  stageId: 'teacher_1',
  type: 'quiz',
  title: 'Quiz',
  order: 0,
  content: {
    type: 'quiz',
    questions: [
      {
        id: 'question_1',
        type: 'single',
        question: 'What is force?',
        options: [{ label: 'A push or pull', value: 'A' }],
        answer: ['A'],
      },
    ],
  },
} satisfies Scene;

function createReadyProject(overrides: Partial<CourseProject> = {}): CourseProject {
  return {
    id: 'teacher_1',
    title: 'Physics',
    requirements: { requirement: 'Teach force' },
    chapterCount: 1,
    workflowTemplateId: 'standard-course',
    status: 'editing',
    createdAt: '2026-05-14T00:00:00.000Z',
    updatedAt: '2026-05-14T00:00:00.000Z',
    outline: {
      projectId: 'teacher_1',
      languageDirective: 'Teach in English.',
      revision: 1,
      chapters: [
        {
          id: 'chapter_1',
          title: 'Forces',
          learningObjectives: ['Understand force'],
          sceneOutlines: [readyQuizOutline],
          status: 'ready',
          dirty: false,
          locked: false,
          order: 0,
        },
      ],
    },
    artifacts: [
      {
        chapterId: 'chapter_1',
        sceneId: 'scene_1',
        sceneType: 'quiz',
        sourceOutlineId: 'outline_1',
        outlineRevision: 1,
        locked: false,
        lastGeneratedAt: '2026-05-14T00:30:00.000Z',
      },
    ],
    generatedScenes: [readyQuizScene],
    ...overrides,
  };
}

describe('teacher course publishing', () => {
  test('builds an existing Stage payload from a teacher project', () => {
    const project = {
      id: 'teacher_1',
      title: 'Physics',
      requirements: { requirement: 'Teach force' },
      chapterCount: 1,
      workflowTemplateId: 'standard-course',
      status: 'editing',
      createdAt: '2026-05-14T00:00:00.000Z',
      updatedAt: '2026-05-14T00:00:00.000Z',
      outline: {
        projectId: 'teacher_1',
        languageDirective: 'Teach in English.',
        revision: 1,
        chapters: [],
      },
      artifacts: [],
    } satisfies CourseProject;
    const scenes = [
      {
        id: 's1',
        stageId: 'teacher_1',
        type: 'quiz',
        title: 'Quiz',
        order: 0,
        content: { type: 'quiz', questions: [] },
      },
    ] satisfies Scene[];
    const now = 123;

    const stage = buildStageFromTeacherProject(project, scenes, now);

    expect(stage).toMatchObject({ id: 'teacher_1', name: 'Physics' });
    expect(stage.description).toBe(project.requirements.requirement);
    expect(stage.createdAt).toBe(new Date(project.createdAt).getTime());
    expect(stage.updatedAt).toBe(now);
    expect(stage.languageDirective).toBe(project.outline?.languageDirective);
  });

  test('rejects dirty ready chapters before publishing', () => {
    const project = createReadyProject({
      outline: {
        ...createReadyProject().outline!,
        chapters: [
          {
            ...createReadyProject().outline!.chapters[0]!,
            status: 'ready',
            dirty: true,
          },
        ],
      },
    });

    const result = validateTeacherProjectPublishable(project);

    const invalid = expectPublishInvalid(result);
    expect(invalid.reason).toContain('chapter_1');
    expect(invalid.reason).toContain('clean');
  });

  test('rejects incomplete chapters before publishing', () => {
    const project = createReadyProject({
      artifacts: [
        {
          chapterId: 'chapter_1',
          sceneId: 'scene_1',
          sceneType: 'quiz',
          sourceOutlineId: 'other_outline',
          outlineRevision: 1,
          locked: false,
          lastGeneratedAt: '2026-05-14T00:30:00.000Z',
        },
      ],
    });

    const result = validateTeacherProjectPublishable(project);

    const invalid = expectPublishInvalid(result);
    expect(invalid.reason).toContain('outline_1');
  });

  test('orders publishable scenes by the current outline rather than stale scene order', () => {
    const slideOutline = {
      id: 'outline_2',
      title: 'Interactive',
      type: 'interactive',
      description: 'Explain force',
      keyPoints: ['Newton'],
      order: 0,
    } satisfies SceneOutline;
    const project = createReadyProject({
      outline: {
        ...createReadyProject().outline!,
        chapters: [
          {
            id: 'chapter_2',
            title: 'Applications',
            learningObjectives: ['Apply force'],
            sceneOutlines: [slideOutline],
            status: 'ready',
            dirty: false,
            locked: false,
            order: 0,
          },
          {
            ...createReadyProject().outline!.chapters[0]!,
            order: 1,
          },
        ],
      },
      artifacts: [
        {
          chapterId: 'chapter_1',
          sceneId: 'scene_1',
          sceneType: 'quiz',
          sourceOutlineId: 'outline_1',
          outlineRevision: 1,
          locked: false,
          lastGeneratedAt: '2026-05-14T00:30:00.000Z',
        },
        {
          chapterId: 'chapter_2',
          sceneId: 'scene_2',
          sceneType: 'interactive',
          sourceOutlineId: 'outline_2',
          outlineRevision: 1,
          locked: false,
          lastGeneratedAt: '2026-05-14T00:30:00.000Z',
        },
      ],
      generatedScenes: [
        readyQuizScene,
        {
          id: 'scene_2',
          stageId: 'teacher_1',
          type: 'interactive',
          title: 'Interactive',
          order: 99,
          content: { type: 'interactive', url: 'https://example.com/force' },
        },
      ],
    });

    const scenes = getPublishableScenes(project);

    expect(scenes.map((scene) => scene.id)).toEqual(['scene_2', 'scene_1']);
    expect(scenes.map((scene) => scene.order)).toEqual([0, 1]);
  });

  test('rejects artifacts from stale outlines before publishing', () => {
    const project = createReadyProject({
      artifacts: [
        ...createReadyProject().artifacts,
        {
          chapterId: 'old_chapter',
          sceneId: 'old_scene',
          sceneType: 'quiz',
          sourceOutlineId: 'old-outline',
          outlineRevision: 1,
          locked: false,
          lastGeneratedAt: '2026-05-14T00:45:00.000Z',
        },
      ],
      generatedScenes: [
        readyQuizScene,
        {
          ...readyQuizScene,
          id: 'old_scene',
          title: 'Old Quiz',
          order: 1,
        },
      ],
    });

    const result = validateTeacherProjectPublishable(project);

    const invalid = expectPublishInvalid(result);
    expect(invalid.statusCode).toBe(400);
    expect(invalid.reason).toContain('old-outline');
  });

  test('rejects quiz scenes without questions before publishing', () => {
    const project = createReadyProject({
      generatedScenes: [
        {
          ...readyQuizScene,
          content: { type: 'quiz', questions: [] },
        },
      ],
    });

    const result = validateTeacherProjectPublishable(project);

    const invalid = expectPublishInvalid(result);
    expect(invalid.reason).toContain('quiz');
  });

  test('allows publishing when only some chapters are ready', () => {
    const slideOutline = {
      id: 'outline_slide',
      title: 'Intro slide',
      type: 'slide',
      description: 'Welcome',
      keyPoints: ['Goals'],
      order: 0,
    } satisfies SceneOutline;
    const slideScene = {
      id: 'scene_slide',
      stageId: 'teacher_1',
      type: 'slide',
      title: 'Intro slide',
      order: 0,
      content: {
        type: 'slide',
        canvas: {
          id: 'slide_1',
          viewportSize: 1000,
          viewportRatio: 0.5625,
          theme: {
            backgroundColor: '#ffffff',
            themeColors: ['#000000'],
            fontColor: '#000000',
            fontName: 'Arial',
          },
          elements: [
            {
              id: 'title_1',
              type: 'text',
              left: 60,
              top: 50,
              width: 880,
              height: 76,
              content: '<p><strong>Welcome</strong></p>',
              rotate: 0,
              defaultFontName: 'Arial',
              defaultColor: '#333333',
            },
          ],
        },
      },
    } satisfies Scene;

    const project = createReadyProject({
      outline: {
        ...createReadyProject().outline!,
        chapters: [
          {
            id: 'chapter_ready',
            title: 'Ready chapter',
            learningObjectives: ['Learn basics'],
            sceneOutlines: [slideOutline],
            status: 'ready',
            dirty: false,
            locked: false,
            order: 0,
          },
          {
            id: 'chapter_draft',
            title: 'Draft chapter',
            learningObjectives: ['Later'],
            sceneOutlines: [],
            status: 'draft',
            dirty: false,
            locked: false,
            order: 1,
          },
        ],
      },
      artifacts: [
        {
          chapterId: 'chapter_ready',
          sceneId: 'scene_slide',
          sceneType: 'slide',
          sourceOutlineId: 'outline_slide',
          outlineRevision: 1,
          locked: false,
          lastGeneratedAt: '2026-05-14T00:30:00.000Z',
        },
      ],
      generatedScenes: [slideScene],
    });

    const result = validateTeacherProjectPublishable(project);
    expect(result.ok).toBe(true);
    expect(getPublishableScenes(project).map((scene) => scene.id)).toEqual(['scene_slide']);
  });

  test('rejects slide scenes without canvas elements before publishing', () => {
    const project = createReadyProject({
      outline: {
        ...createReadyProject().outline!,
        chapters: [
          {
            ...createReadyProject().outline!.chapters[0]!,
            sceneOutlines: [
              {
                ...readyQuizOutline,
                title: 'Slide',
                type: 'slide',
              },
            ],
          },
        ],
      },
      artifacts: [
        {
          chapterId: 'chapter_1',
          sceneId: 'scene_1',
          sceneType: 'slide',
          sourceOutlineId: 'outline_1',
          outlineRevision: 1,
          locked: false,
          lastGeneratedAt: '2026-05-14T00:30:00.000Z',
        },
      ],
      generatedScenes: [
        {
          id: 'scene_1',
          stageId: 'teacher_1',
          type: 'slide',
          title: 'Slide',
          order: 0,
          content: {
            type: 'slide',
            canvas: {
              id: 'slide_1',
              viewportSize: 1000,
              viewportRatio: 0.5625,
              theme: {
                backgroundColor: '#ffffff',
                themeColors: ['#000000'],
                fontColor: '#000000',
                fontName: 'Arial',
              },
              elements: [],
            },
          },
        },
      ],
    });

    const result = validateTeacherProjectPublishable(project);

    const invalid = expectPublishInvalid(result);
    expect(invalid.reason).toContain('slide');
  });
});
