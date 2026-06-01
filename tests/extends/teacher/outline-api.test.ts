/**
 * @extends-from tests/teacher/outline-api.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { POST as generateOutline } from '@app-extends/api/teacher/projects/[projectId]/generate-outline/route';
import { PUT as saveOutline } from '@app-extends/api/teacher/projects/[projectId]/outline/route';
import { callLLM } from '@/lib/ai/llm';
import { generateSceneOutlinesFromRequirements } from '@/lib/generation/outline-generator';
import { readTeacherProject, writeTeacherProject } from '@/lib/teacher/course-project-storage';

vi.mock('@/lib/ai/llm', () => ({
  callLLM: vi.fn(async () => ({ text: '{"ok":true}' })),
}));

vi.mock('@/lib/server/resolve-model', () => ({
  resolveModelFromRequest: vi.fn(async () => ({
    model: 'mock-model',
    modelInfo: { outputWindow: 4096 },
    modelString: 'mock-provider/mock-model',
    thinkingConfig: undefined,
  })),
}));

vi.mock('@/lib/generation/outline-generator', () => ({
  generateSceneOutlinesFromRequirements: vi.fn(
    async (_requirements, _pdfText, _pdfImages, aiCall) => {
      await aiCall('system prompt', 'user prompt');
      return {
        success: true,
        data: {
          languageDirective: 'Teach in English.',
          outlines: [
            {
              id: 'scene_1',
              type: 'slide',
              title: 'Forces',
              description: 'Introduce balanced and unbalanced forces.',
              keyPoints: ['Net force', 'Motion changes'],
              teachingObjective: 'Explain how force affects motion.',
              order: 1,
            },
            {
              id: 'scene_2',
              type: 'quiz',
              title: 'Force Check',
              description: 'Check understanding of force diagrams.',
              keyPoints: ['Free body diagram'],
              teachingObjective: 'Identify forces in a diagram.',
              order: 2,
            },
          ],
        },
      };
    },
  ),
}));

vi.mock('@/lib/teacher/course-project-storage', () => ({
  isValidTeacherProjectId: vi.fn(() => true),
  readTeacherProject: vi.fn(async (projectId: string) => ({
    id: projectId,
    title: 'Physics',
    requirements: { requirement: 'Teach force' },
    chapterCount: 1,
    workflowTemplateId: 'standard-course',
    status: 'draft',
    createdAt: '2026-05-14T00:00:00.000Z',
    updatedAt: '2026-05-14T00:00:00.000Z',
    outline: {
      projectId,
      revision: 2,
      chapters: [
        {
          id: 'chapter_1',
          title: 'Forces',
          learningObjectives: ['Explain net force'],
          sceneOutlines: [],
          status: 'draft' as const,
          dirty: false,
          locked: false,
          order: 0,
          summary: '',
        },
      ],
    },
    artifacts: [],
  })),
  writeTeacherProject: vi.fn(async (project) => project),
}));

function createValidOutline(projectId = 'teacher_1') {
  return {
    projectId,
    revision: 2,
    chapters: [
      {
        id: 'chapter_1',
        title: 'Forces',
        learningObjectives: ['Explain net force'],
        sceneOutlines: [
          {
            id: 'scene_1',
            type: 'slide',
            title: 'Net Force',
            description: 'Introduce balanced and unbalanced forces.',
            keyPoints: ['Net force', 'Motion changes'],
            order: 0,
          },
        ],
        status: 'draft',
        dirty: false,
        locked: false,
        order: 0,
      },
    ],
  };
}

describe('teacher generate outline API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('generates scene outlines for a single chapter and persists', async () => {
    const request = new Request(
      'http://localhost/api/extends/teacher/projects/teacher_1/generate-outline',
      {
        method: 'POST',
        body: JSON.stringify({ chapterId: 'chapter_1' }),
      },
    );

    const response = await generateOutline(request as never, {
      params: Promise.resolve({ projectId: 'teacher_1' }),
    });
    const json = await response.json();
    const writtenProject = vi.mocked(writeTeacherProject).mock.calls[0]?.[0];

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.project.outline.revision).toBe(2);
    expect(json.project.outline.projectId).toBe('teacher_1');
    expect(json.project.outline.languageDirective).toBe('Teach in English.');
    expect(json.project.outline.chapters).toHaveLength(1);
    expect(json.project.outline.chapters[0].sceneOutlines).toHaveLength(2);
    expect(json.chapter.id).toBe('chapter_1');
    expect(json.chapter.sceneOutlines).toHaveLength(2);
    expect(writtenProject?.status).toBe('outlining');
    expect(writtenProject?.outline?.chapters[0].sceneOutlines).toHaveLength(2);
    expect(writtenProject?.updatedAt).not.toBe('2026-05-14T00:00:00.000Z');
    expect(generateSceneOutlinesFromRequirements).toHaveBeenCalledWith(
      expect.objectContaining({ requirement: expect.stringContaining('Forces') }),
      undefined,
      undefined,
      expect.any(Function),
      undefined,
      expect.objectContaining({
        teacherContext: expect.stringContaining('Forces'),
        generationMode: 'requirement-driven',
      }),
    );
    expect(callLLM).toHaveBeenCalledWith(
      {
        model: 'mock-model',
        system: 'system prompt',
        prompt: 'user prompt',
        maxOutputTokens: 4096,
      },
      'teacher-outline-chapter',
      undefined,
      undefined,
    );
  });

  test('returns 400 when chapterId is missing', async () => {
    const request = new Request(
      'http://localhost/api/extends/teacher/projects/teacher_1/generate-outline',
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
    );
    const response = await generateOutline(request as never, {
      params: Promise.resolve({ projectId: 'teacher_1' }),
    });
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.errorCode).toBe('MISSING_REQUIRED_FIELD');
    expect(writeTeacherProject).not.toHaveBeenCalled();
  });

  test('returns 400 when chapterId does not exist on project', async () => {
    const request = new Request(
      'http://localhost/api/extends/teacher/projects/teacher_1/generate-outline',
      {
        method: 'POST',
        body: JSON.stringify({ chapterId: 'unknown-id' }),
      },
    );
    const response = await generateOutline(request as never, {
      params: Promise.resolve({ projectId: 'teacher_1' }),
    });
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(writeTeacherProject).not.toHaveBeenCalled();
  });

  test('does not expose generator failure details to clients', async () => {
    vi.mocked(generateSceneOutlinesFromRequirements).mockResolvedValueOnce({
      success: false,
      error: 'SECRET_PROVIDER_ERROR',
    });
    const request = new Request(
      'http://localhost/api/extends/teacher/projects/teacher_1/generate-outline',
      {
        method: 'POST',
        body: JSON.stringify({ chapterId: 'chapter_1' }),
      },
    );

    const response = await generateOutline(request as never, {
      params: Promise.resolve({ projectId: 'teacher_1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.errorCode).toBe('GENERATION_FAILED');
    expect(json.error).toBe('Failed to generate chapter outline');
    expect(JSON.stringify(json)).not.toContain('SECRET_PROVIDER_ERROR');
    expect(writeTeacherProject).not.toHaveBeenCalled();
  });
});

describe('teacher save outline API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('returns invalid request for malformed JSON', async () => {
    const request = new Request('http://localhost/api/extends/teacher/projects/teacher_1/outline', {
      method: 'PUT',
      body: '{"outline":',
      headers: { 'content-type': 'application/json' },
    });

    const response = await saveOutline(request as never, {
      params: Promise.resolve({ projectId: 'teacher_1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.errorCode).toBe('INVALID_REQUEST');
    expect(writeTeacherProject).not.toHaveBeenCalled();
  });

  test('returns invalid request for null request body', async () => {
    const request = new Request('http://localhost/api/extends/teacher/projects/teacher_1/outline', {
      method: 'PUT',
      body: JSON.stringify(null),
      headers: { 'content-type': 'application/json' },
    });

    const response = await saveOutline(request as never, {
      params: Promise.resolve({ projectId: 'teacher_1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.errorCode).toBe('INVALID_REQUEST');
    expect(writeTeacherProject).not.toHaveBeenCalled();
  });

  test.each([
    {
      name: 'missing chapter title',
      outline: {
        ...createValidOutline(),
        chapters: [{ ...createValidOutline().chapters[0], title: '' }],
      },
    },
    {
      name: 'wrong project id',
      outline: createValidOutline('teacher_2'),
    },
    {
      name: 'malformed scene outline',
      outline: {
        ...createValidOutline(),
        chapters: [
          {
            ...createValidOutline().chapters[0],
            sceneOutlines: [
              {
                id: 'scene_1',
                type: 'unsupported',
                title: 'Broken',
                description: 'Broken scene outline.',
                keyPoints: ['A'],
                order: 0,
              },
            ],
          },
        ],
      },
    },
  ])('rejects malformed outline payload: $name', async ({ outline }) => {
    const request = new Request('http://localhost/api/extends/teacher/projects/teacher_1/outline', {
      method: 'PUT',
      body: JSON.stringify({ outline }),
    });

    const response = await saveOutline(request as never, {
      params: Promise.resolve({ projectId: 'teacher_1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(writeTeacherProject).not.toHaveBeenCalled();
  });

  test('returns not found when saving an outline for a missing project', async () => {
    vi.mocked(readTeacherProject).mockResolvedValueOnce(null);
    const request = new Request('http://localhost/api/extends/teacher/projects/teacher_1/outline', {
      method: 'PUT',
      body: JSON.stringify({ outline: createValidOutline() }),
    });

    const response = await saveOutline(request as never, {
      params: Promise.resolve({ projectId: 'teacher_1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.success).toBe(false);
    expect(writeTeacherProject).not.toHaveBeenCalled();
  });
});
