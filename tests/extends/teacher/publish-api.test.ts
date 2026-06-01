/**
 * @extends-from tests/teacher/publish-api.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { POST } from '@app-extends/api/teacher/projects/[projectId]/publish/route';
import { persistClassroom } from '@/lib/server/classroom-storage';
import { readTeacherProject, writeTeacherProject } from '@/lib/teacher/course-project-storage';
import type { CourseProject } from '@/lib/teacher/course-types';
import type { Scene } from '@/lib/types/stage';

vi.mock('@/lib/server/classroom-storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/classroom-storage')>();
  return {
    ...actual,
    buildRequestOrigin: vi.fn(() => 'http://localhost'),
    persistClassroom: vi.fn(async ({ id, stage, scenes, sourceWorkflowId }) => ({
      id,
      stage,
      scenes,
      sourceWorkflowId,
      schemaVersion: 1,
      createdAt: '2026-05-14T01:00:00.000Z',
      updatedAt: '2026-05-14T01:00:00.000Z',
      revision: 1,
      url: `http://localhost/classroom/${id}`,
    })),
  };
});

vi.mock('@/lib/teacher/course-project-storage', () => ({
  isValidTeacherProjectId: vi.fn(() => true),
  readTeacherProject: vi.fn(),
  writeTeacherProject: vi.fn(async (project) => project),
}));

const scenes: Scene[] = [
  {
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
  },
];

function createProject(overrides: Partial<CourseProject> = {}): CourseProject {
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
          sceneOutlines: [
            {
              id: 'outline_1',
              type: 'quiz',
              title: 'Quiz',
              description: 'Check understanding',
              keyPoints: ['Force basics'],
              order: 0,
            },
          ],
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
    generatedScenes: scenes,
    ...overrides,
  };
}

describe('teacher project publish API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readTeacherProject).mockResolvedValue(createProject());
  });

  test('returns 404 when the teacher project does not exist', async () => {
    vi.mocked(readTeacherProject).mockResolvedValueOnce(null);
    const request = new Request('http://localhost/api/extends/teacher/projects/missing/publish', {
      method: 'POST',
    });

    const response = await POST(request as never, {
      params: Promise.resolve({ projectId: 'missing' }),
    });
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.success).toBe(false);
    expect(json.errorCode).toBe('INVALID_REQUEST');
    expect(persistClassroom).not.toHaveBeenCalled();
    expect(writeTeacherProject).not.toHaveBeenCalled();
  });

  test('publishes generated scenes to an existing classroom payload', async () => {
    const request = new Request('http://localhost/api/extends/teacher/projects/teacher_1/publish', {
      method: 'POST',
    });

    const response = await POST(request as never, {
      params: Promise.resolve({ projectId: 'teacher_1' }),
    });
    const json = await response.json();
    const writeCalls = vi.mocked(writeTeacherProject).mock.calls;
    const startedProject = writeCalls[0]?.[0];
    const writtenProject = writeCalls.at(-1)?.[0];

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.classroomId).toBe('teacher_1');
    expect(json.url).toBe('http://localhost/classroom/teacher_1');
    expect(startedProject?.run).toMatchObject({
      step: 'publish',
      progress: 80,
    });
    expect(startedProject?.run?.message).toContain('Publishing');
    expect(persistClassroom).toHaveBeenCalledWith(
      {
        id: 'teacher_1',
        stage: expect.objectContaining({ id: 'teacher_1', name: 'Physics' }),
        scenes,
        sourceWorkflowId: 'standard-course',
      },
      'http://localhost',
    );
    expect(writtenProject).toMatchObject({
      id: 'teacher_1',
      status: 'published',
      publishedClassroomId: 'teacher_1',
      run: {
        step: 'idle',
        progress: 100,
        message: 'Published',
      },
    });
  });

  test('rejects projects that only have artifact metadata without scenes', async () => {
    vi.mocked(readTeacherProject).mockResolvedValueOnce(createProject({ generatedScenes: [] }));
    const request = new Request('http://localhost/api/extends/teacher/projects/teacher_1/publish', {
      method: 'POST',
    });

    const response = await POST(request as never, {
      params: Promise.resolve({ projectId: 'teacher_1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.errorCode).toBe('INVALID_REQUEST');
    expect(persistClassroom).not.toHaveBeenCalled();
    expect(writeTeacherProject).not.toHaveBeenCalled();
  });

  test('rejects draft projects before publishing', async () => {
    vi.mocked(readTeacherProject).mockResolvedValueOnce(createProject({ status: 'draft' }));
    const request = new Request('http://localhost/api/extends/teacher/projects/teacher_1/publish', {
      method: 'POST',
    });

    const response = await POST(request as never, {
      params: Promise.resolve({ projectId: 'teacher_1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.success).toBe(false);
    expect(json.errorCode).toBe('INVALID_REQUEST');
    expect(persistClassroom).not.toHaveBeenCalled();
    expect(writeTeacherProject).not.toHaveBeenCalled();
  });

  test('rejects route project id mismatches before publishing', async () => {
    vi.mocked(readTeacherProject).mockResolvedValueOnce(createProject({ id: 'teacher_2' }));
    const request = new Request('http://localhost/api/extends/teacher/projects/teacher_1/publish', {
      method: 'POST',
    });

    const response = await POST(request as never, {
      params: Promise.resolve({ projectId: 'teacher_1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.errorCode).toBe('INVALID_REQUEST');
    expect(persistClassroom).not.toHaveBeenCalled();
    expect(writeTeacherProject).not.toHaveBeenCalled();
  });

  test('persists publish start and failure when classroom persistence fails', async () => {
    vi.mocked(persistClassroom).mockRejectedValueOnce(new Error('persist failed'));
    const request = new Request('http://localhost/api/extends/teacher/projects/teacher_1/publish', {
      method: 'POST',
    });

    const response = await POST(request as never, {
      params: Promise.resolve({ projectId: 'teacher_1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.errorCode).toBe('INTERNAL_ERROR');
    expect(writeTeacherProject).toHaveBeenCalledTimes(2);
    expect(vi.mocked(writeTeacherProject).mock.calls[0]?.[0].run).toMatchObject({
      step: 'publish',
      progress: 80,
    });
    expect(vi.mocked(writeTeacherProject).mock.calls[1]?.[0].run).toMatchObject({
      step: 'publish',
      progress: 0,
      message: 'Failed to publish teacher project',
    });
  });
});
