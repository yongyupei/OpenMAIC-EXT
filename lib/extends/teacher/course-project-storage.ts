/**
 * @extends-from lib/teacher/course-project-storage.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { promises as fs } from 'fs';
import path from 'path';
import type { CourseProject } from '@/lib/teacher/course-types';
import { normalizeDesignWorkbenchChatFromStorage } from '@/lib/teacher/design-chat-validation';
import { writeJsonFileAtomic } from '@/lib/server/classroom-storage';

export const TEACHER_PROJECTS_DIR = path.join(process.cwd(), 'data', 'teacher-projects');

const COURSE_PROJECT_STATUSES = new Set([
  'draft',
  'outlining',
  'outline-ready',
  'generating',
  'editing',
  'published',
]);

export function isValidTeacherProjectId(id: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

export async function writeTeacherProject(project: CourseProject): Promise<CourseProject> {
  if (!isValidTeacherProjectId(project.id)) {
    throw new Error(`Invalid teacher project id: ${project.id}`);
  }
  const filePath = path.join(TEACHER_PROJECTS_DIR, `${project.id}.json`);
  await writeJsonFileAtomic(filePath, project);
  return project;
}

export async function listTeacherProjects(): Promise<CourseProject[]> {
  let fileNames: string[];
  try {
    fileNames = await fs.readdir(TEACHER_PROJECTS_DIR);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }

  const projects = await Promise.all(
    fileNames
      .filter((fileName) => {
        if (!fileName.endsWith('.json')) return false;
        const projectId = path.basename(fileName, '.json');
        return isValidTeacherProjectId(projectId);
      })
      .map(async (fileName) => {
        const filePath = path.join(TEACHER_PROJECTS_DIR, fileName);
        return parseTeacherProjectFile(await fs.readFile(filePath, 'utf-8'));
      }),
  );

  return projects
    .filter((project): project is CourseProject => project !== null)
    .sort(compareTeacherProjects);
}

function parseTeacherProjectFile(contents: string): CourseProject | null {
  try {
    const parsed = JSON.parse(contents) as unknown;
    return isCourseProject(parsed) ? migrateForRead(parsed) : null;
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

function isCourseProject(value: unknown): value is CourseProject {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    isRecord(value.requirements) &&
    typeof value.chapterCount === 'number' &&
    value.workflowTemplateId === 'standard-course' &&
    typeof value.status === 'string' &&
    COURSE_PROJECT_STATUSES.has(value.status) &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string' &&
    Array.isArray(value.artifacts)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function compareTeacherProjects(left: CourseProject, right: CourseProject): number {
  return (
    compareTimeDesc(left.updatedAt, right.updatedAt) ||
    compareTimeDesc(left.createdAt, right.createdAt) ||
    left.id.localeCompare(right.id)
  );
}

function compareTimeDesc(left: string, right: string): number {
  return parseSortableTime(right) - parseSortableTime(left);
}

function parseSortableTime(value: string): number {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

export async function deleteTeacherProject(projectId: string): Promise<boolean> {
  if (!isValidTeacherProjectId(projectId)) {
    throw new Error(`Invalid teacher project id: ${projectId}`);
  }
  const filePath = path.join(TEACHER_PROJECTS_DIR, `${projectId}.json`);
  try {
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

export async function readTeacherProject(projectId: string): Promise<CourseProject | null> {
  if (!isValidTeacherProjectId(projectId)) {
    throw new Error(`Invalid teacher project id: ${projectId}`);
  }
  const filePath = path.join(TEACHER_PROJECTS_DIR, `${projectId}.json`);
  try {
    const raw = JSON.parse(await fs.readFile(filePath, 'utf-8')) as CourseProject;
    return migrateForRead(raw);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

function migrateForRead(project: CourseProject): CourseProject {
  const overview =
    typeof project.overview === 'string' && project.overview.length > 0
      ? project.overview
      : (project.requirements?.requirement ?? '');
  const status = project.status === 'outline-ready' ? 'draft' : project.status;
  const outline = project.outline
    ? {
        ...project.outline,
        chapters: project.outline.chapters.map((chapter) => ({
          ...chapter,
          summary: chapter.summary ?? '',
          referenceFiles: chapter.referenceFiles ?? [],
          deepSearchEnabled: chapter.deepSearchEnabled ?? false,
          knowledgeNodeIds: chapter.knowledgeNodeIds ?? [],
        })),
      }
    : project.outline;
  const designWorkbenchChat = normalizeDesignWorkbenchChatFromStorage(
    (project as unknown as Record<string, unknown>).designWorkbenchChat,
  );
  const next: CourseProject = { ...project, overview, status, outline };
  if (designWorkbenchChat) {
    next.designWorkbenchChat = designWorkbenchChat;
  } else {
    delete next.designWorkbenchChat;
  }
  return next;
}
