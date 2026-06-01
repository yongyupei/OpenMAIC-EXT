/**
 * @extends-from tests/teacher/publish-classroom-api.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { POST } from '@app-extends/api/teacher/projects/[projectId]/publish-classroom/route';
import { persistClassroom } from '@/lib/server/classroom-storage';
import { readTeacherProject, writeTeacherProject } from '@/lib/teacher/course-project-storage';
import type { CourseProject } from '@/lib/teacher/course-types';
import type { Scene, Stage } from '@/lib/types/stage';

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
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
      revision: 1,
      url: `http://localhost/classroom/${id}`,
    })),
  };
});

vi.mock('@/lib/teacher/course-project-storage', () => ({
  isValidTeacherProjectId: vi.fn(() => true),
  readTeacherProject: vi.fn(),
  writeTeacherProject: vi.fn(async (project: CourseProject) => project),
}));

const baseProject: CourseProject = {
  id: 'teacher_pc_1',
  title: 'Test course',
  requirements: { requirement: 'Learn things' },
  chapterCount: 1,
  workflowTemplateId: 'standard-course',
  status: 'editing',
  createdAt: '2026-05-15T00:00:00.000Z',
  updatedAt: '2026-05-15T00:00:00.000Z',
  artifacts: [],
};

const draftStage: Stage = {
  id: 'draft_stage_client_nanoid',
  name: 'Test course',
  description: '',
  style: 'professional',
  createdAt: 1,
  updatedAt: 1,
};

const scenes: Scene[] = [
  {
    id: 'scene_a',
    stageId: 'draft_stage_client_nanoid',
    type: 'quiz',
    title: 'Intro',
    order: 0,
    content: {
      type: 'quiz',
      questions: [
        {
          id: 'q1',
          type: 'single',
          question: 'Q?',
          options: [{ label: 'A', value: 'A' }],
          answer: ['A'],
        },
      ],
    },
  },
];

describe('POST /api/extends/teacher/projects/[projectId]/publish-classroom', () => {
  beforeEach(() => {
    vi.mocked(readTeacherProject).mockResolvedValue({ ...baseProject });
    vi.mocked(persistClassroom).mockClear();
  });

  test('rewrites stage.id and scene.stageId to the teacher project (classroom) id', async () => {
    const req = new Request('http://localhost/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: draftStage, scenes }),
    }) as unknown as import('next/server').NextRequest;

    const res = await POST(req, { params: Promise.resolve({ projectId: 'teacher_pc_1' }) });
    expect(res.status).toBe(200);

    expect(persistClassroom).toHaveBeenCalledTimes(1);
    const call = vi.mocked(persistClassroom).mock.calls[0][0];
    expect(call.id).toBe('teacher_pc_1');
    expect(call.stage.id).toBe('teacher_pc_1');
    expect(call.scenes.every((s) => s.stageId === 'teacher_pc_1')).toBe(true);
    expect(call.scenes[0].id).toBe('scene_a');
  });
});
