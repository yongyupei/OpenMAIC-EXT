/**
 * @extends-from lib/teacher/routes.ts
 * @fork-branch feat/html-slide-design-workbench
 */
export function buildTeacherNewPath(): string {
  return '/teacher/new';
}

export function buildTeacherProjectsPath(): string {
  return '/teacher/projects';
}

export function buildTeacherDesignPath(projectId: string): string {
  return `/teacher/projects/${encodeURIComponent(projectId)}/design`;
}

export interface TeacherProjectRouteOptions {
  readonly chapterId?: string;
}

function appendChapterIdQuery(path: string, options?: TeacherProjectRouteOptions): string {
  const chapterId = options?.chapterId?.trim();
  if (!chapterId) return path;
  return `${path}?chapterId=${encodeURIComponent(chapterId)}`;
}

export function buildTeacherStudioPath(
  projectId: string,
  options?: TeacherProjectRouteOptions,
): string {
  return appendChapterIdQuery(`/teacher/projects/${encodeURIComponent(projectId)}/studio`, options);
}

export function buildTeacherGeneratePath(
  projectId: string,
  options?: TeacherProjectRouteOptions,
): string {
  return appendChapterIdQuery(
    `/teacher/projects/${encodeURIComponent(projectId)}/generate`,
    options,
  );
}

export function buildTeacherPreviewPath(
  projectId: string,
  options?: TeacherProjectRouteOptions,
): string {
  return appendChapterIdQuery(
    `/teacher/projects/${encodeURIComponent(projectId)}/preview`,
    options,
  );
}

export function buildChapterGeneratePath(
  projectId: string,
  chapterId: string,
  options?: { resume?: boolean; regenerate?: boolean },
): string {
  const path = `/teacher/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/generate`;
  const params = new URLSearchParams();
  if (options?.resume) params.set('resume', '1');
  if (options?.regenerate) params.set('regenerate', '1');
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function buildChapterStudioPath(projectId: string, chapterId: string): string {
  return `/teacher/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/studio`;
}
