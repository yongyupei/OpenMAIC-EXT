/**
 * @extends-from tests/teacher/patch-api.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { PATCH } from '@app-extends/api/teacher/projects/[projectId]/route';
import { readTeacherProject, writeTeacherProject } from '@/lib/teacher/course-project-storage';
import type { CourseProject } from '@/lib/teacher/course-types';

vi.mock('@/lib/teacher/course-project-storage', () => ({
  isValidTeacherProjectId: vi.fn(() => true),
  readTeacherProject: vi.fn(),
  writeTeacherProject: vi.fn(async (project: CourseProject) => project),
}));

const baseProject: CourseProject = {
  id: 'p1',
  title: 'Old title',
  requirements: { requirement: 'r' },
  overview: 'old overview',
  chapterCount: 2,
  workflowTemplateId: 'standard-course',
  status: 'draft',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  artifacts: [],
  outline: {
    projectId: 'p1',
    revision: 1,
    chapters: [
      {
        id: 'ch-a',
        title: 'A',
        learningObjectives: ['oa1'],
        sceneOutlines: [],
        status: 'draft',
        dirty: false,
        locked: false,
        order: 0,
        summary: '',
      },
      {
        id: 'ch-b',
        title: 'B',
        learningObjectives: ['ob1'],
        sceneOutlines: [],
        status: 'ready',
        dirty: false,
        locked: false,
        order: 1,
        summary: 'b-sum',
      },
    ],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readTeacherProject).mockResolvedValue(structuredClone(baseProject));
});

describe('PATCH /api/extends/teacher/projects/{id}', () => {
  test('updates overview only', async () => {
    const req = new Request('http://localhost/x', {
      method: 'PATCH',
      body: JSON.stringify({ overview: 'new overview' }),
    });
    const res = await PATCH(req as never, { params: Promise.resolve({ projectId: 'p1' }) });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.project.overview).toBe('new overview');
    expect(json.idMapping).toBeUndefined();
  });

  test('inserts ai- prefixed chapter and returns idMapping', async () => {
    const req = new Request('http://localhost/x', {
      method: 'PATCH',
      body: JSON.stringify({
        chapters: [
          { id: 'ch-a', title: 'A', learningObjectives: ['oa1'], summary: '' },
          { id: 'ch-b', title: 'B', learningObjectives: ['ob1'], summary: 'b-sum' },
          { id: 'ai-1', title: 'C', learningObjectives: [], summary: '' },
        ],
      }),
    });
    const res = await PATCH(req as never, { params: Promise.resolve({ projectId: 'p1' }) });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.project.outline.chapters).toHaveLength(3);
    expect(json.idMapping['ai-1']).toBeDefined();
    expect(json.project.outline.chapters[2].id).toBe(json.idMapping['ai-1']);
  });

  test('deletes chapter and clears its artifacts/scenes', async () => {
    vi.mocked(readTeacherProject).mockResolvedValue({
      ...structuredClone(baseProject),
      artifacts: [
        {
          chapterId: 'ch-b',
          sceneId: 'sc-1',
          sceneType: 'slide',
          sourceOutlineId: 'so-1',
          outlineRevision: 1,
          locked: false,
          lastGeneratedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      generatedScenes: [{ id: 'sc-1', type: 'slide' } as never],
    });
    const req = new Request('http://localhost/x', {
      method: 'PATCH',
      body: JSON.stringify({
        chapters: [{ id: 'ch-a', title: 'A', learningObjectives: ['oa1'], summary: '' }],
      }),
    });
    const res = await PATCH(req as never, { params: Promise.resolve({ projectId: 'p1' }) });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.project.outline.chapters).toHaveLength(1);
    expect(json.project.artifacts).toHaveLength(0);
    expect(json.project.generatedScenes ?? []).toHaveLength(0);
  });

  test('marks ready chapter dirty when title changes', async () => {
    const req = new Request('http://localhost/x', {
      method: 'PATCH',
      body: JSON.stringify({
        chapters: [
          { id: 'ch-a', title: 'A', learningObjectives: ['oa1'], summary: '' },
          { id: 'ch-b', title: 'B renamed', learningObjectives: ['ob1'], summary: 'b-sum' },
        ],
      }),
    });
    const res = await PATCH(req as never, { params: Promise.resolve({ projectId: 'p1' }) });
    const json = await res.json();
    expect(res.status).toBe(200);
    const chB = json.project.outline.chapters.find((c: { id: string }) => c.id === 'ch-b');
    expect(chB.status).toBe('dirty');
    expect(chB.dirty).toBe(true);
  });

  test('rejects invalid body', async () => {
    const req = new Request('http://localhost/x', {
      method: 'PATCH',
      body: JSON.stringify({ chapters: 'not-an-array' }),
    });
    const res = await PATCH(req as never, { params: Promise.resolve({ projectId: 'p1' }) });
    expect(res.status).toBe(400);
  });

  test('persists designWorkbenchChat messages', async () => {
    const req = new Request('http://localhost/x', {
      method: 'PATCH',
      body: JSON.stringify({
        designWorkbenchChat: {
          messages: [
            { id: 'u1', role: 'user', content: 'Add a chapter on photosynthesis' },
            {
              id: 'a1',
              role: 'assistant',
              content: 'Done.',
              toolEvents: [{ id: 'e1', kind: 'chapterAdded', label: 'Photosynthesis' }],
            },
          ],
        },
      }),
    });
    const res = await PATCH(req as never, { params: Promise.resolve({ projectId: 'p1' }) });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.project.designWorkbenchChat?.messages).toHaveLength(2);
    expect(json.project.designWorkbenchChat?.messages[0].content).toContain('photosynthesis');
    expect(json.project.designWorkbenchChat?.updatedAt).toBeTruthy();
  });

  test('rejects empty patch object', async () => {
    const req = new Request('http://localhost/x', {
      method: 'PATCH',
      body: JSON.stringify({}),
    });
    const res = await PATCH(req as never, { params: Promise.resolve({ projectId: 'p1' }) });
    expect(res.status).toBe(400);
  });
});
