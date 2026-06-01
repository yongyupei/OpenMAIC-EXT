/**
 * @extends-from tests/teacher/migrations.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { promises as fs } from 'fs';
import path from 'path';
import { afterEach, describe, expect, test } from 'vitest';
import { readTeacherProject, TEACHER_PROJECTS_DIR } from '@/lib/teacher/course-project-storage';

const TMP_PROJECT_ID = 'mig_test_project';

async function seed(payload: Record<string, unknown>) {
  await fs.mkdir(TEACHER_PROJECTS_DIR, { recursive: true });
  await fs.writeFile(
    path.join(TEACHER_PROJECTS_DIR, `${TMP_PROJECT_ID}.json`),
    JSON.stringify(payload),
    'utf-8',
  );
}

afterEach(async () => {
  await fs.rm(path.join(TEACHER_PROJECTS_DIR, `${TMP_PROJECT_ID}.json`), { force: true });
});

describe('readTeacherProject migrations', () => {
  test('overview missing falls back to requirements.requirement', async () => {
    await seed({
      id: TMP_PROJECT_ID,
      title: 'T',
      requirements: { requirement: 'Original input' },
      chapterCount: 1,
      workflowTemplateId: 'standard-course',
      status: 'draft',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      artifacts: [],
    });
    const project = await readTeacherProject(TMP_PROJECT_ID);
    expect(project?.overview).toBe('Original input');
  });

  test('outline-ready status collapses to draft', async () => {
    await seed({
      id: TMP_PROJECT_ID,
      title: 'T',
      requirements: { requirement: 'r' },
      chapterCount: 1,
      workflowTemplateId: 'standard-course',
      status: 'outline-ready',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      artifacts: [],
    });
    const project = await readTeacherProject(TMP_PROJECT_ID);
    expect(project?.status).toBe('draft');
  });

  test('chapter.summary missing becomes empty string', async () => {
    await seed({
      id: TMP_PROJECT_ID,
      title: 'T',
      requirements: { requirement: 'r' },
      chapterCount: 1,
      workflowTemplateId: 'standard-course',
      status: 'draft',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      artifacts: [],
      outline: {
        projectId: TMP_PROJECT_ID,
        revision: 1,
        chapters: [
          {
            id: 'c1',
            title: 'Ch 1',
            learningObjectives: [],
            sceneOutlines: [],
            status: 'draft',
            dirty: false,
            locked: false,
            order: 0,
          },
        ],
      },
    });
    const project = await readTeacherProject(TMP_PROJECT_ID);
    expect(project?.outline?.chapters[0]?.summary).toBe('');
  });

  test('overview empty string falls back to requirements.requirement', async () => {
    await seed({
      id: TMP_PROJECT_ID,
      title: 'T',
      requirements: { requirement: 'Original input' },
      overview: '',
      chapterCount: 1,
      workflowTemplateId: 'standard-course',
      status: 'draft',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      artifacts: [],
    });
    const project = await readTeacherProject(TMP_PROJECT_ID);
    expect(project?.overview).toBe('Original input');
  });

  test('listTeacherProjects also applies migrations', async () => {
    await seed({
      id: TMP_PROJECT_ID,
      title: 'T',
      requirements: { requirement: 'List input' },
      chapterCount: 1,
      workflowTemplateId: 'standard-course',
      status: 'outline-ready',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      artifacts: [],
    });
    const { listTeacherProjects } = await import('@/lib/teacher/course-project-storage');
    const projects = await listTeacherProjects();
    const found = projects.find((p) => p.id === TMP_PROJECT_ID);
    expect(found?.status).toBe('draft');
    expect(found?.overview).toBe('List input');
  });
});
