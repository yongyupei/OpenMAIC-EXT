/**
 * @extends-from e2e/tests/teacher-course-flow.spec.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { promises as fs } from 'fs';
import path from 'path';
import { expect, test } from '@playwright/test';

const teacherProjectsDir = path.join(process.cwd(), 'data', 'teacher-projects');
const classroomsDir = path.join(process.cwd(), 'data', 'classrooms');
const e2ePort = process.env.E2E_PORT ?? '3002';
const baseURL = `http://localhost:${e2ePort}`;

const createdProjectIds = new Set<string>();
const createdClassroomIds = new Set<string>();

type TeacherProjectRecord = {
  id: string;
  outline?: {
    chapters: Array<{ id: string }>;
  };
  chapterClassrooms?: Record<
    string,
    {
      chapterId: string;
      classroomId: string;
      status: string;
      generationStep?: string;
      sceneCount?: number;
      createdAt: string;
      updatedAt: string;
    }
  >;
};

test.afterEach(async () => {
  await Promise.all([
    ...[...createdProjectIds].map((projectId) =>
      fs.rm(path.join(teacherProjectsDir, `${projectId}.json`), { force: true }),
    ),
    ...[...createdClassroomIds].map((classroomId) =>
      fs.rm(path.join(classroomsDir, `${classroomId}.json`), { force: true }),
    ),
  ]);
  createdProjectIds.clear();
  createdClassroomIds.clear();
});

test('teacher can open design workbench and generate through to Studio', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    window.localStorage.setItem('locale', 'en-US');
  });

  const createResponse = await request.post(`${baseURL}/api/extends/teacher/projects`, {
    data: {
      requirement: 'Teach force and motion with short activities.',
      overview: 'Teach force and motion with short activities.',
      chapters: [
        {
          title: 'Forces in everyday motion',
          learningObjectives: ['Explain how balanced and unbalanced forces affect motion.'],
          summary: 'Intro chapter',
        },
      ],
    },
  });
  expect(createResponse.ok()).toBe(true);
  const createJson = (await createResponse.json()) as {
    project?: { id?: string; outline?: { chapters?: Array<{ id: string }> } };
  };
  const projectId = createJson.project?.id;
  const chapterId = createJson.project?.outline?.chapters?.[0]?.id;
  expect(projectId).toBeTruthy();
  expect(chapterId).toBeTruthy();
  createdProjectIds.add(projectId!);

  const classroomId = `${projectId}-ch-${chapterId}`;
  const readyClassroom = {
    chapterId: chapterId!,
    classroomId,
    status: 'ready' as const,
    sceneCount: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await page.route(
    (url) =>
      url.pathname.includes('/api/extends/teacher/projects/') &&
      url.pathname.includes('/chapters/') &&
      !url.pathname.endsWith('/generate'),
    async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }

      const ids = parseTeacherProjectChapterPath(new URL(route.request().url()).pathname);
      if (!ids) {
        await route.continue();
        return;
      }

      await route.fulfill({
        contentType: 'application/json',
        json: {
          success: true,
          chapterClassroom: readyClassroom,
        },
      });
    },
  );

  await page.route(
    (url) =>
      url.pathname.includes('/api/extends/teacher/projects/') &&
      url.pathname.endsWith('/generate'),
    async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }

      const ids = parseTeacherProjectChapterPath(new URL(route.request().url()).pathname);
      if (!ids) {
        await route.continue();
        return;
      }

      const projectFile = path.join(teacherProjectsDir, `${ids.projectId}.json`);
      const project = JSON.parse(await fs.readFile(projectFile, 'utf-8')) as TeacherProjectRecord;
      const updatedProject: TeacherProjectRecord = {
        ...project,
        chapterClassrooms: {
          ...project.chapterClassrooms,
          [ids.chapterId]: readyClassroom,
        },
      };
      await fs.writeFile(projectFile, JSON.stringify(updatedProject, null, 2), 'utf-8');

      await route.fulfill({
        contentType: 'application/json',
        json: {
          success: true,
          classroomId,
          sceneCount: 1,
        },
      });
    },
  );

  await page.goto(`/teacher/projects/${encodeURIComponent(projectId!)}/design`);

  await expect(page.getByTestId('teacher-design-overview')).toBeVisible();
  await page.getByTestId(`teacher-design-generate-chapter-${chapterId}`).click();

  await expect(page).toHaveURL(
    new RegExp(`/chapters/${escapeRegExp(chapterId!)}/generate`),
    { timeout: 30_000 },
  );

  await expect(page).toHaveURL(
    new RegExp(
      `/teacher/projects/${escapeRegExp(projectId!)}/chapters/${escapeRegExp(chapterId!)}/studio$`,
    ),
    {
      timeout: 90_000,
    },
  );
});

test('home page exposes teacher identity control', async ({ page }) => {
  await page.goto('/home');
  await expect(page.getByTestId('home-identity-teacher')).toBeVisible();
});

function parseTeacherProjectChapterPath(pathname: string): {
  projectId: string;
  chapterId: string;
} | null {
  const segments = pathname.split('/').filter(Boolean);
  const projectsIdx = segments.indexOf('projects');
  const chaptersIdx = segments.indexOf('chapters');
  if (projectsIdx < 0 || chaptersIdx < 0) return null;
  const projectId = segments[projectsIdx + 1];
  const chapterId = segments[chaptersIdx + 1];
  if (!projectId || !chapterId) return null;
  return {
    projectId: decodeURIComponent(projectId),
    chapterId: decodeURIComponent(chapterId),
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
