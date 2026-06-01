/**
 * @extends-from tests/teacher/course-project-storage.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { promises as fs } from 'fs';
import path from 'path';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { CourseProject } from '@/lib/teacher/course-types';
import {
  TEACHER_PROJECTS_DIR,
  listTeacherProjects,
  readTeacherProject,
  writeTeacherProject,
} from '@/lib/teacher/course-project-storage';

vi.mock('fs', () => ({
  promises: {
    mkdir: vi.fn(async () => undefined),
    writeFile: vi.fn(async () => undefined),
    rename: vi.fn(async () => undefined),
    readdir: vi.fn(async () => []),
    readFile: vi.fn(),
  },
}));

const fileContents = new Map<string, string>();

function project(id: string, revision: number): CourseProject {
  return {
    id,
    title: 'Physics',
    requirements: { requirement: 'Teach force' },
    chapterCount: 1,
    workflowTemplateId: 'standard-course',
    status: 'draft',
    createdAt: '2026-05-14T00:00:00.000Z',
    updatedAt: '2026-05-14T00:00:00.000Z',
    artifacts: [],
    outline: { projectId: id, revision, chapters: [] },
  };
}

describe('teacher project storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fileContents.clear();
    vi.mocked(fs.mkdir).mockResolvedValue(undefined as never);
    vi.mocked(fs.writeFile).mockImplementation(async (filePath, data) => {
      fileContents.set(String(filePath), String(data));
    });
    vi.mocked(fs.rename).mockImplementation(async (from, to) => {
      const contents = fileContents.get(String(from));
      if (contents === undefined) {
        throw Object.assign(new Error('missing temp file'), { code: 'ENOENT' });
      }
      fileContents.set(String(to), contents);
      fileContents.delete(String(from));
    });
    vi.mocked(fs.readdir).mockResolvedValue([] as never);
    vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
      const contents = fileContents.get(String(filePath));
      if (contents === undefined) {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      }
      return contents;
    });
  });

  test('reads and writes teacher projects', async () => {
    const teacherProject = project('teacher_1', 1);
    const expectedPath = path.join(TEACHER_PROJECTS_DIR, 'teacher_1.json');

    await writeTeacherProject(teacherProject);

    expect(fs.mkdir).toHaveBeenCalledTimes(1);
    expect(fs.writeFile).toHaveBeenCalledTimes(1);
    expect(fs.rename).toHaveBeenCalledTimes(1);
    const [[writePath, writeContents]] = vi.mocked(fs.writeFile).mock.calls;
    const [[renameFrom, renameTo]] = vi.mocked(fs.rename).mock.calls;
    expect(String(writePath)).toBe(String(renameFrom));
    expect(String(renameTo)).toBe(expectedPath);
    expect(JSON.parse(String(writeContents))).toEqual(teacherProject);

    const stored = await readTeacherProject('teacher_1');

    expect(fs.readFile).toHaveBeenLastCalledWith(expectedPath, 'utf-8');
    expect(stored).toEqual({
      ...teacherProject,
      overview: teacherProject.requirements.requirement,
    });
  });

  test('rejects invalid project ids before reading or writing', async () => {
    await expect(readTeacherProject('../teacher_1')).rejects.toThrow('Invalid teacher project id');
    await expect(writeTeacherProject(project('teacher/1', 1))).rejects.toThrow(
      'Invalid teacher project id',
    );
    expect(fs.readFile).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  test('returns null when reading a missing teacher project', async () => {
    const expectedPath = path.join(TEACHER_PROJECTS_DIR, 'missing_teacher.json');

    await expect(readTeacherProject('missing_teacher')).resolves.toBeNull();

    expect(fs.readFile).toHaveBeenCalledWith(expectedPath, 'utf-8');
  });

  test('lists teacher projects by most recently updated', async () => {
    vi.mocked(fs.readdir).mockResolvedValueOnce([
      'teacher_old.json',
      'teacher_new.json',
      'README.md',
    ] as never);
    vi.mocked(fs.readFile)
      .mockResolvedValueOnce(
        JSON.stringify({
          ...project('teacher_old', 1),
          updatedAt: '2026-05-14T00:00:00.000Z',
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          ...project('teacher_new', 1),
          updatedAt: '2026-05-15T00:00:00.000Z',
        }),
      );

    const projects = await listTeacherProjects();

    expect(projects.map((storedProject) => storedProject.id)).toEqual([
      'teacher_new',
      'teacher_old',
    ]);
  });

  test('ignores json files whose basename is not a valid project id', async () => {
    vi.mocked(fs.readdir).mockResolvedValueOnce([
      'teacher_valid.json',
      'teacher.invalid.json',
      'teacher invalid.json',
    ] as never);
    vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify(project('teacher_valid', 1)));

    const projects = await listTeacherProjects();

    expect(projects.map((storedProject) => storedProject.id)).toEqual(['teacher_valid']);
    expect(fs.readFile).toHaveBeenCalledTimes(1);
  });

  test('skips project files with invalid JSON while listing other projects', async () => {
    vi.mocked(fs.readdir).mockResolvedValueOnce([
      'teacher_valid.json',
      'teacher_broken.json',
    ] as never);
    vi.mocked(fs.readFile)
      .mockResolvedValueOnce(JSON.stringify(project('teacher_valid', 1)))
      .mockResolvedValueOnce('{');

    const projects = await listTeacherProjects();

    expect(projects.map((storedProject) => storedProject.id)).toEqual(['teacher_valid']);
  });

  test('skips structurally invalid project files while listing other projects', async () => {
    vi.mocked(fs.readdir).mockResolvedValueOnce([
      'teacher_valid.json',
      'teacher_empty.json',
      'teacher_bad_artifacts.json',
    ] as never);
    vi.mocked(fs.readFile)
      .mockResolvedValueOnce(JSON.stringify(project('teacher_valid', 1)))
      .mockResolvedValueOnce(JSON.stringify({}))
      .mockResolvedValueOnce(
        JSON.stringify({
          ...project('teacher_bad_artifacts', 1),
          artifacts: {},
        }),
      );

    const projects = await listTeacherProjects();

    expect(projects.map((storedProject) => storedProject.id)).toEqual(['teacher_valid']);
  });

  test('sorts projects with the same updated time by id ascending', async () => {
    vi.mocked(fs.readdir).mockResolvedValueOnce(['teacher_b.json', 'teacher_a.json'] as never);
    vi.mocked(fs.readFile)
      .mockResolvedValueOnce(JSON.stringify(project('teacher_b', 1)))
      .mockResolvedValueOnce(JSON.stringify(project('teacher_a', 1)));

    const projects = await listTeacherProjects();

    expect(projects.map((storedProject) => storedProject.id)).toEqual(['teacher_a', 'teacher_b']);
  });

  test('sorts projects with the same updated time by created time descending', async () => {
    vi.mocked(fs.readdir).mockResolvedValueOnce([
      'teacher_older.json',
      'teacher_newer.json',
    ] as never);
    vi.mocked(fs.readFile)
      .mockResolvedValueOnce(
        JSON.stringify({
          ...project('teacher_older', 1),
          createdAt: '2026-05-13T00:00:00.000Z',
          updatedAt: '2026-05-15T00:00:00.000Z',
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          ...project('teacher_newer', 1),
          createdAt: '2026-05-14T00:00:00.000Z',
          updatedAt: '2026-05-15T00:00:00.000Z',
        }),
      );

    const projects = await listTeacherProjects();

    expect(projects.map((storedProject) => storedProject.id)).toEqual([
      'teacher_newer',
      'teacher_older',
    ]);
  });

  test('returns an empty project list when the directory is missing', async () => {
    vi.mocked(fs.readdir).mockRejectedValueOnce(
      Object.assign(new Error('missing'), { code: 'ENOENT' }),
    );

    await expect(listTeacherProjects()).resolves.toEqual([]);
  });
});
