/**
 * @extends-from tests/teacher/project-api.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { GET, POST } from '@app-extends/api/teacher/projects/route';
import {
  DELETE as DELETEProject,
  PUT as PUTProject,
} from '@app-extends/api/teacher/projects/[projectId]/route';
import { PUT as PUTOutline } from '@app-extends/api/teacher/projects/[projectId]/outline/route';
import { listTeacherProjects, writeTeacherProject } from '@/lib/teacher/course-project-storage';

vi.mock('@/lib/teacher/course-project-storage', () => ({
  isValidTeacherProjectId: vi.fn(() => true),
  deleteTeacherProject: vi.fn(async () => true),
  readTeacherProject: vi.fn(async (projectId: string) => ({
    id: projectId,
    title: 'Physics',
    requirements: { requirement: 'Teach force' },
    chapterCount: 1,
    workflowTemplateId: 'standard-course',
    status: 'draft',
    createdAt: '2026-05-14T00:00:00.000Z',
    updatedAt: '2026-05-14T00:00:00.000Z',
    artifacts: [],
    publishedClassroomId: 'existing-classroom',
  })),
  listTeacherProjects: vi.fn(async () => []),
  writeTeacherProject: vi.fn(async (project) => project),
}));

describe('teacher project API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('creates a teacher project from course requirements', async () => {
    const req = new Request('http://localhost/api/extends/teacher/projects', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Physics',
        requirement: 'Teach force',
        chapterCount: 2,
        targetAudience: 'Grade 8',
      }),
    });

    const response = await POST(req as never);
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.project.title).toBe('Physics');
  });

  test('lists teacher projects', async () => {
    vi.mocked(listTeacherProjects).mockResolvedValueOnce([
      {
        id: 'teacher_1',
        title: 'Physics',
        requirements: { requirement: 'Teach force' },
        chapterCount: 1,
        workflowTemplateId: 'standard-course',
        status: 'draft',
        createdAt: '2026-05-14T00:00:00.000Z',
        updatedAt: '2026-05-14T00:00:00.000Z',
        artifacts: [],
        designWorkbenchChat: {
          messages: [{ id: 'm1', role: 'user', content: 'hello' }],
          updatedAt: '2026-05-14T00:00:00.000Z',
        },
      },
    ]);

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.projects).toContainEqual(
      expect.objectContaining({
        id: 'teacher_1',
        title: 'Physics',
        hasDesignChat: true,
      }),
    );
    expect(json.projects[0].designWorkbenchChat).toBeUndefined();
  });

  test('returns an api error when listing teacher projects fails', async () => {
    vi.mocked(listTeacherProjects).mockRejectedValueOnce(new Error('storage unavailable'));

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.errorCode).toBe('INTERNAL_ERROR');
  });

  test('rejects malformed project creation JSON', async () => {
    const req = new Request('http://localhost/api/extends/teacher/projects', {
      method: 'POST',
      body: '{',
    });

    const response = await POST(req as never);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.errorCode).toBe('INVALID_REQUEST');
  });

  test('rejects null project creation bodies', async () => {
    const req = new Request('http://localhost/api/extends/teacher/projects', {
      method: 'POST',
      body: 'null',
    });

    const response = await POST(req as never);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.errorCode).toBe('INVALID_REQUEST');
  });

  test('rejects non-string project creation fields', async () => {
    const req = new Request('http://localhost/api/extends/teacher/projects', {
      method: 'POST',
      body: JSON.stringify({
        title: { text: 'Physics' },
        requirement: 'Teach force',
      }),
    });

    const response = await POST(req as never);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.errorCode).toBe('INVALID_REQUEST');
  });

  test('updates only teacher form fields on a project', async () => {
    const req = new Request('http://localhost/api/extends/teacher/projects/teacher_1', {
      method: 'PUT',
      body: JSON.stringify({
        status: 'published',
        publishedClassroomId: 'x',
        title: 'New',
      }),
    });

    const response = await PUTProject(req as never, {
      params: Promise.resolve({ projectId: 'teacher_1' }),
    });
    const json = await response.json();
    const writtenProject = vi.mocked(writeTeacherProject).mock.calls[0]?.[0];

    expect(response.status).toBe(200);
    expect(json.project.title).toBe('New');
    expect(writtenProject?.title).toBe('New');
    expect(writtenProject?.status).toBe('draft');
    expect(writtenProject?.publishedClassroomId).toBe('existing-classroom');
  });

  test.each([
    ['malformed JSON', '{'],
    ['null body', 'null'],
    ['array body', '[]'],
    ['non-string title', JSON.stringify({ title: { text: 'Physics' } })],
    ['non-string targetAudience', JSON.stringify({ targetAudience: 8 })],
    ['zero chapterCount', JSON.stringify({ chapterCount: 0 })],
    ['fractional chapterCount', JSON.stringify({ chapterCount: 1.5 })],
    ['invalid requirements object', JSON.stringify({ requirements: { requirement: 42 } })],
    ['invalid requirements type', JSON.stringify({ requirements: 'Teach force' })],
  ])('rejects project updates with %s', async (_label, body) => {
    const req = new Request('http://localhost/api/extends/teacher/projects/teacher_1', {
      method: 'PUT',
      body,
    });

    const response = await PUTProject(req as never, {
      params: Promise.resolve({ projectId: 'teacher_1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.errorCode).toBe('INVALID_REQUEST');
    expect(writeTeacherProject).not.toHaveBeenCalled();
  });

  test('rejects outline updates without an outline field', async () => {
    const req = new Request('http://localhost/api/extends/teacher/projects/teacher_1/outline', {
      method: 'PUT',
      body: JSON.stringify({}),
    });

    const response = await PUTOutline(req as never, {
      params: Promise.resolve({ projectId: 'teacher_1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.errorCode).toBe('MISSING_REQUIRED_FIELD');
  });

  test('rejects outline updates for a different project', async () => {
    const req = new Request('http://localhost/api/extends/teacher/projects/teacher_1/outline', {
      method: 'PUT',
      body: JSON.stringify({
        outline: {
          projectId: 'teacher_2',
          revision: 1,
          chapters: [],
        },
      }),
    });

    const response = await PUTOutline(req as never, {
      params: Promise.resolve({ projectId: 'teacher_1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.errorCode).toBe('INVALID_REQUEST');
  });

  test('rejects outline updates without chapters', async () => {
    const req = new Request('http://localhost/api/extends/teacher/projects/teacher_1/outline', {
      method: 'PUT',
      body: JSON.stringify({
        outline: {
          projectId: 'teacher_1',
          revision: 1,
        },
      }),
    });

    const response = await PUTOutline(req as never, {
      params: Promise.resolve({ projectId: 'teacher_1' }),
    });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.errorCode).toBe('INVALID_REQUEST');
  });

  test('creates project with overview + chapters (no requirement)', async () => {
    const req = new Request('http://localhost/api/extends/teacher/projects', {
      method: 'POST',
      body: JSON.stringify({
        overview: '一门面向高一学生的有机化学入门课，强调实验直觉。',
        chapters: [
          {
            title: '原子键合',
            learningObjectives: ['理解共价键', '区分极性与非极性'],
            summary: '从电子云开始建立直觉。',
          },
          {
            title: '官能团速览',
            learningObjectives: ['识别 6 种常见官能团'],
            summary: '配对实验现象。',
          },
        ],
      }),
    });
    const response = await POST(req as never);
    const json = await response.json();
    expect(response.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.project.overview).toContain('有机化学');
    expect(json.project.outline?.chapters).toHaveLength(2);
    expect(json.project.outline?.chapters[0].title).toBe('原子键合');
    expect(json.project.requirements.requirement).toContain('有机化学');
  });

  test('rejects POST with neither requirement nor overview', async () => {
    const req = new Request('http://localhost/api/extends/teacher/projects', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const response = await POST(req as never);
    expect(response.status).toBe(400);
  });

  test('deletes a teacher project by id', async () => {
    const { deleteTeacherProject } = await import('@/lib/teacher/course-project-storage');
    const response = await DELETEProject(
      new Request('http://localhost/api/extends/teacher/projects/teacher_1', {
        method: 'DELETE',
      }) as never,
      {
        params: Promise.resolve({ projectId: 'teacher_1' }),
      },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.projectId).toBe('teacher_1');
    expect(deleteTeacherProject).toHaveBeenCalledWith('teacher_1');
  });
});
