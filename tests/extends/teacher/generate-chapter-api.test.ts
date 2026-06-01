/**
 * @extends-from tests/teacher/generate-chapter-api.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { POST } from '@app-extends/api/teacher/projects/[projectId]/generate-chapter/route';
import { callLLM } from '@/lib/ai/llm';
import {
  buildCompleteScene,
  generateSceneActions,
  generateSceneContent,
} from '@/lib/generation/generation-pipeline';
import { readTeacherProject, writeTeacherProject } from '@/lib/teacher/course-project-storage';
import type { CourseProject } from '@/lib/teacher/course-types';

vi.mock('@/lib/ai/llm', () => ({
  callLLM: vi.fn(async () => ({ text: '{"ok":true}' })),
}));

vi.mock('@/lib/server/resolve-model', () => ({
  resolveModelFromRequest: vi.fn(async () => ({
    model: 'mock-model',
    modelInfo: { outputWindow: 4096 },
    modelString: 'mock-provider/mock-model',
    thinkingConfig: { mode: 'disabled', enabled: false },
  })),
}));

vi.mock('@/lib/generation/generation-pipeline', () => ({
  generateSceneContent: vi.fn(async (_outline, aiCall) => {
    await aiCall('content system', 'content user');
    return {
      elements: [],
      background: { type: 'solid', color: '#ffffff' },
    };
  }),
  generateSceneActions: vi.fn(async (outline, _content, aiCall) => {
    await aiCall('actions system', 'actions user');
    return [{ id: `action_${outline.id}`, type: 'speech', text: `${outline.title} speech` }];
  }),
  buildCompleteScene: vi.fn((outline, _content, actions, stageId) => ({
    id: `scene_${outline.id}`,
    stageId,
    type: outline.type,
    title: outline.title,
    order: outline.order,
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
      },
    },
    actions,
  })),
}));

vi.mock('@/lib/teacher/course-project-storage', () => ({
  isValidTeacherProjectId: vi.fn(() => true),
  readTeacherProject: vi.fn(),
  writeTeacherProject: vi.fn(async (project) => project),
}));

function createProject(overrides: Partial<CourseProject> = {}): CourseProject {
  return {
    id: 'teacher_1',
    title: 'Physics',
    requirements: { requirement: 'Teach force' },
    chapterCount: 1,
    workflowTemplateId: 'standard-course',
    status: 'outline-ready',
    createdAt: '2026-05-14T00:00:00.000Z',
    updatedAt: '2026-05-14T00:00:00.000Z',
    outline: {
      projectId: 'teacher_1',
      languageDirective: 'Teach in English.',
      revision: 2,
      chapters: [
        {
          id: 'chapter_1',
          title: 'Forces',
          learningObjectives: ['Explain forces'],
          status: 'dirty',
          dirty: true,
          locked: false,
          order: 0,
          sceneOutlines: [
            {
              id: 'outline_1',
              type: 'slide',
              title: 'Intro',
              description: 'Introduce forces',
              keyPoints: ['Net force'],
              order: 0,
            },
          ],
        },
      ],
    },
    artifacts: [],
    ...overrides,
  };
}

describe('teacher generate chapter API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readTeacherProject).mockResolvedValue(createProject());
  });

  test('generates a chapter, saves artifacts, and returns scenes', async () => {
    const request = new Request(
      'http://localhost/api/extends/teacher/projects/teacher_1/generate-chapter',
      {
        method: 'POST',
        body: JSON.stringify({ chapterId: 'chapter_1' }),
      },
    );

    const response = await POST(request as never, {
      params: Promise.resolve({ projectId: 'teacher_1' }),
    });
    const json = await response.json();
    const writeCalls = vi.mocked(writeTeacherProject).mock.calls;
    const startedProject = writeCalls[0]?.[0];
    const writtenProject = writeCalls.at(-1)?.[0];

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.scenes).toHaveLength(1);
    expect(json.scenes[0].id).toBe('scene_outline_1');
    expect(startedProject?.run).toMatchObject({
      step: 'chapter-content',
      progress: 5,
      failedChapterId: 'chapter_1',
    });
    expect(startedProject?.run?.message).toContain('Generating');
    expect(writtenProject?.status).toBe('editing');
    expect(writtenProject?.outline?.chapters[0]).toMatchObject({
      id: 'chapter_1',
      status: 'ready',
      dirty: false,
    });
    expect(writtenProject?.artifacts).toMatchObject([
      {
        chapterId: 'chapter_1',
        sceneId: 'scene_outline_1',
        sceneType: 'slide',
        sourceOutlineId: 'outline_1',
        outlineRevision: 2,
        locked: false,
      },
    ]);
    expect(generateSceneContent).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'outline_1' }),
      expect.any(Function),
      expect.objectContaining({
        languageDirective: 'Teach in English.',
        agents: expect.any(Array),
        thinkingConfig: { mode: 'disabled', enabled: false },
        resolvedTemplate: expect.objectContaining({
          source: 'builtin',
          record: expect.objectContaining({ id: 'builtin:default-professional' }),
        }),
      }),
    );
    expect(generateSceneActions).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'outline_1' }),
      expect.any(Object),
      expect.any(Function),
      expect.objectContaining({
        languageDirective: 'Teach in English.',
        agents: expect.any(Array),
      }),
    );
    expect(buildCompleteScene).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'outline_1' }),
      expect.any(Object),
      expect.any(Array),
      'teacher_1',
      expect.objectContaining({
        resolvedTemplate: expect.objectContaining({
          source: 'builtin',
          record: expect.objectContaining({ id: 'builtin:default-professional' }),
        }),
      }),
    );
    expect(callLLM).toHaveBeenCalledWith(
      {
        model: 'mock-model',
        system: 'content system',
        prompt: 'content user',
        maxOutputTokens: 4096,
      },
      'teacher-chapter',
      undefined,
      { mode: 'disabled', enabled: false },
    );
  });

  test('passes the language model when generating PBL scene content', async () => {
    vi.mocked(readTeacherProject).mockResolvedValue(
      createProject({
        outline: {
          projectId: 'teacher_1',
          languageDirective: 'Teach in English.',
          revision: 2,
          chapters: [
            {
              id: 'chapter_1',
              title: 'Project',
              learningObjectives: ['Solve a real problem'],
              status: 'dirty',
              dirty: true,
              locked: false,
              order: 0,
              sceneOutlines: [
                {
                  id: 'pbl_1',
                  type: 'pbl',
                  title: 'Bridge Challenge',
                  description: 'Design a bridge using force concepts.',
                  keyPoints: ['Forces', 'Constraints'],
                  order: 0,
                  pblConfig: {
                    projectTopic: 'Bridge design',
                    projectDescription: 'Create and evaluate a bridge design.',
                    targetSkills: ['systems thinking'],
                  },
                },
              ],
            },
          ],
        },
      }),
    );
    const request = new Request(
      'http://localhost/api/extends/teacher/projects/teacher_1/generate-chapter',
      {
        method: 'POST',
        body: JSON.stringify({ chapterId: 'chapter_1' }),
      },
    );

    const response = await POST(request as never, {
      params: Promise.resolve({ projectId: 'teacher_1' }),
    });

    expect(response.status).toBe(200);
    expect(generateSceneContent).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'pbl_1', type: 'pbl' }),
      expect.any(Function),
      expect.objectContaining({
        languageDirective: 'Teach in English.',
        languageModel: 'mock-model',
        agents: expect.any(Array),
        thinkingConfig: { mode: 'disabled', enabled: false },
      }),
    );
  });

  test('passes cross-page context and previous speech when generating scene actions', async () => {
    vi.mocked(readTeacherProject).mockResolvedValue(
      createProject({
        outline: {
          projectId: 'teacher_1',
          languageDirective: 'Teach in English.',
          revision: 2,
          chapters: [
            {
              id: 'chapter_1',
              title: 'Forces',
              learningObjectives: ['Explain forces'],
              status: 'dirty',
              dirty: true,
              locked: false,
              order: 0,
              sceneOutlines: [
                {
                  id: 'outline_1',
                  type: 'slide',
                  title: 'Intro',
                  description: 'Introduce forces',
                  keyPoints: ['Net force'],
                  order: 0,
                },
                {
                  id: 'outline_2',
                  type: 'slide',
                  title: 'Applications',
                  description: 'Apply force concepts',
                  keyPoints: ['Free body diagrams'],
                  order: 1,
                },
              ],
            },
          ],
        },
      }),
    );
    const request = new Request(
      'http://localhost/api/extends/teacher/projects/teacher_1/generate-chapter',
      {
        method: 'POST',
        body: JSON.stringify({ chapterId: 'chapter_1' }),
      },
    );

    const response = await POST(request as never, {
      params: Promise.resolve({ projectId: 'teacher_1' }),
    });

    expect(response.status).toBe(200);
    expect(generateSceneActions).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: 'outline_1' }),
      expect.any(Object),
      expect.any(Function),
      expect.objectContaining({
        ctx: {
          pageIndex: 1,
          totalPages: 2,
          allTitles: ['Intro', 'Applications'],
          previousSpeeches: [],
        },
      }),
    );
    expect(generateSceneActions).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: 'outline_2' }),
      expect.any(Object),
      expect.any(Function),
      expect.objectContaining({
        ctx: {
          pageIndex: 2,
          totalPages: 2,
          allTitles: ['Intro', 'Applications'],
          previousSpeeches: ['Intro speech'],
        },
      }),
    );
  });

  test('rejects writing if the chapter becomes locked during generation', async () => {
    const initialProject = createProject();
    const latestProject = {
      ...initialProject,
      title: 'Physics updated elsewhere',
      artifacts: [
        {
          chapterId: 'other_chapter',
          sceneId: 'existing_scene',
          sceneType: 'slide' as const,
          sourceOutlineId: 'existing_outline',
          outlineRevision: 2,
          locked: false,
          lastGeneratedAt: '2026-05-14T01:00:00.000Z',
        },
      ],
      outline: {
        ...initialProject.outline!,
        chapters: initialProject.outline!.chapters.map((chapter) => ({
          ...chapter,
          locked: true,
        })),
      },
    };
    vi.mocked(readTeacherProject)
      .mockResolvedValueOnce(initialProject)
      .mockResolvedValueOnce(latestProject);
    const request = new Request(
      'http://localhost/api/extends/teacher/projects/teacher_1/generate-chapter',
      {
        method: 'POST',
        body: JSON.stringify({ chapterId: 'chapter_1' }),
      },
    );

    const response = await POST(request as never, {
      params: Promise.resolve({ projectId: 'teacher_1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.success).toBe(false);
    expect(json.errorCode).toBe('INVALID_REQUEST');
    expect(json.error).toBe('Project changed during generation');
    expect(writeTeacherProject).toHaveBeenCalledTimes(2);
    expect(vi.mocked(writeTeacherProject).mock.calls[0]?.[0].run).toMatchObject({
      step: 'chapter-content',
      progress: 5,
      failedChapterId: 'chapter_1',
    });
    const abortedProject = vi.mocked(writeTeacherProject).mock.calls[1]?.[0];
    expect(abortedProject).toMatchObject({
      title: 'Physics updated elsewhere',
      artifacts: latestProject.artifacts,
      run: {
        step: 'chapter-content',
        progress: 0,
        message: 'Project changed during generation',
        failedChapterId: 'chapter_1',
      },
    });
    expect(abortedProject?.generatedScenes).toBeUndefined();
  });

  test('rejects writing if chapter scene outlines change during generation', async () => {
    const initialProject = createProject();
    const latestProject = {
      ...initialProject,
      title: 'Physics updated elsewhere',
      outline: {
        ...initialProject.outline!,
        chapters: initialProject.outline!.chapters.map((chapter) => ({
          ...chapter,
          sceneOutlines: [
            {
              ...chapter.sceneOutlines[0]!,
              title: 'Changed intro',
            },
          ],
        })),
      },
    };
    vi.mocked(readTeacherProject)
      .mockResolvedValueOnce(initialProject)
      .mockResolvedValueOnce(latestProject);
    const request = new Request(
      'http://localhost/api/extends/teacher/projects/teacher_1/generate-chapter',
      {
        method: 'POST',
        body: JSON.stringify({ chapterId: 'chapter_1' }),
      },
    );

    const response = await POST(request as never, {
      params: Promise.resolve({ projectId: 'teacher_1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.success).toBe(false);
    expect(json.errorCode).toBe('INVALID_REQUEST');
    expect(json.error).toBe('Project changed during generation');
    expect(writeTeacherProject).toHaveBeenCalledTimes(2);
    expect(vi.mocked(writeTeacherProject).mock.calls[0]?.[0].run).toMatchObject({
      step: 'chapter-content',
      progress: 5,
      failedChapterId: 'chapter_1',
    });
    const abortedProject = vi.mocked(writeTeacherProject).mock.calls[1]?.[0];
    expect(abortedProject).toMatchObject({
      title: 'Physics updated elsewhere',
      artifacts: [],
      run: {
        step: 'chapter-content',
        progress: 0,
        message: 'Project changed during generation',
        failedChapterId: 'chapter_1',
      },
    });
    expect(abortedProject?.generatedScenes).toBeUndefined();
  });

  test('rejects writing if outline revision changes during generation', async () => {
    const initialProject = createProject();
    const latestProject = {
      ...initialProject,
      title: 'Physics updated elsewhere',
      outline: {
        ...initialProject.outline!,
        revision: 3,
      },
    };
    vi.mocked(readTeacherProject)
      .mockResolvedValueOnce(initialProject)
      .mockResolvedValueOnce(latestProject);
    const request = new Request(
      'http://localhost/api/extends/teacher/projects/teacher_1/generate-chapter',
      {
        method: 'POST',
        body: JSON.stringify({ chapterId: 'chapter_1' }),
      },
    );

    const response = await POST(request as never, {
      params: Promise.resolve({ projectId: 'teacher_1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.success).toBe(false);
    expect(json.errorCode).toBe('INVALID_REQUEST');
    expect(json.error).toBe('Project changed during generation');
    expect(writeTeacherProject).toHaveBeenCalledTimes(2);
    const abortedProject = vi.mocked(writeTeacherProject).mock.calls[1]?.[0];
    expect(abortedProject).toMatchObject({
      title: 'Physics updated elsewhere',
      artifacts: [],
      run: {
        step: 'chapter-content',
        progress: 0,
        message: 'Project changed during generation',
        failedChapterId: 'chapter_1',
      },
    });
    expect(abortedProject?.generatedScenes).toBeUndefined();
  });

  test('returns a generic generation failure when a scene cannot be built', async () => {
    vi.mocked(buildCompleteScene).mockReturnValueOnce(null);
    const request = new Request(
      'http://localhost/api/extends/teacher/projects/teacher_1/generate-chapter',
      {
        method: 'POST',
        body: JSON.stringify({ chapterId: 'chapter_1' }),
      },
    );

    const response = await POST(request as never, {
      params: Promise.resolve({ projectId: 'teacher_1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.errorCode).toBe('GENERATION_FAILED');
    expect(json.error).toBe('Failed to generate chapter scenes');
    expect(writeTeacherProject).toHaveBeenCalledTimes(2);
    expect(vi.mocked(writeTeacherProject).mock.calls.at(-1)?.[0].run).toMatchObject({
      step: 'chapter-content',
      progress: 0,
      message: 'Failed to generate chapter scenes',
      failedChapterId: 'chapter_1',
    });
  });

  test('persists a failed run when scene content generation fails', async () => {
    vi.mocked(generateSceneContent).mockResolvedValueOnce(null);
    const request = new Request(
      'http://localhost/api/extends/teacher/projects/teacher_1/generate-chapter',
      {
        method: 'POST',
        body: JSON.stringify({ chapterId: 'chapter_1' }),
      },
    );

    const response = await POST(request as never, {
      params: Promise.resolve({ projectId: 'teacher_1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
    expect(writeTeacherProject).toHaveBeenCalledTimes(2);
    expect(vi.mocked(writeTeacherProject).mock.calls[0]?.[0].run).toMatchObject({
      step: 'chapter-content',
      progress: 5,
      failedChapterId: 'chapter_1',
    });
    expect(vi.mocked(writeTeacherProject).mock.calls[1]?.[0].run).toMatchObject({
      step: 'chapter-content',
      progress: 0,
      message: 'Failed to generate chapter scenes',
      failedChapterId: 'chapter_1',
    });
  });

  test('persists a failed run when saving generated scenes fails', async () => {
    vi.mocked(writeTeacherProject).mockImplementation(async (project) => {
      if (project.run?.step === 'idle') {
        throw new Error('write failed');
      }
      return project;
    });
    const request = new Request(
      'http://localhost/api/extends/teacher/projects/teacher_1/generate-chapter',
      {
        method: 'POST',
        body: JSON.stringify({ chapterId: 'chapter_1' }),
      },
    );

    const response = await POST(request as never, {
      params: Promise.resolve({ projectId: 'teacher_1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.errorCode).toBe('INTERNAL_ERROR');
    expect(writeTeacherProject).toHaveBeenCalledTimes(3);
    expect(vi.mocked(writeTeacherProject).mock.calls.at(-1)?.[0].run).toMatchObject({
      step: 'chapter-content',
      progress: 0,
      message: 'Failed to generate teacher project chapter',
      failedChapterId: 'chapter_1',
    });
  });

  test('rejects locked chapters without generating scenes', async () => {
    vi.mocked(readTeacherProject).mockResolvedValueOnce(
      createProject({
        outline: {
          projectId: 'teacher_1',
          revision: 2,
          chapters: [
            {
              id: 'chapter_1',
              title: 'Forces',
              learningObjectives: ['Explain forces'],
              status: 'dirty',
              dirty: true,
              locked: true,
              order: 0,
              sceneOutlines: [],
            },
          ],
        },
      }),
    );
    const request = new Request(
      'http://localhost/api/extends/teacher/projects/teacher_1/generate-chapter',
      {
        method: 'POST',
        body: JSON.stringify({ chapterId: 'chapter_1' }),
      },
    );

    const response = await POST(request as never, {
      params: Promise.resolve({ projectId: 'teacher_1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.errorCode).toBe('INVALID_REQUEST');
    expect(generateSceneContent).not.toHaveBeenCalled();
    expect(writeTeacherProject).not.toHaveBeenCalled();
  });
});
