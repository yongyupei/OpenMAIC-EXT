/**
 * @extends-from lib/teacher/teacher-projects-client.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import type { GenerationMode } from '@/lib/slide-templates/types';
import type { CourseProjectChatMessage } from '@/lib/teacher/design-chat-types';
import type { CourseProject } from '@/lib/teacher/course-types';
import type { GenerationProfile, GenerationProfileOverride } from '@/lib/teacher/generation-profile';
import type { TeacherProjectListItem } from '@/lib/teacher/project-list-summary';
import type { ChapterSnapshot } from '@/lib/teacher/teacher-refine-client';

export interface CreateProjectInput {
  requirement?: string;
  overview?: string;
  chapters?: Array<{
    title: string;
    learningObjectives: string[];
    summary?: string;
  }>;
  title?: string;
  targetAudience?: string;
  durationMinutes?: number;
}

export interface PatchProjectInput {
  title?: string;
  overview?: string;
  slideTemplateId?: string | null;
  generationMode?: GenerationMode | null;
  generationProfile?: GenerationProfile;
  chapters?: Array<{
    id: string;
    title: string;
    learningObjectives: string[];
    summary?: string;
    deepSearchEnabled?: boolean;
    knowledgeNodeIds?: string[];
    slideTemplateId?: string;
    generationMode?: GenerationMode;
    generationProfileOverride?: GenerationProfileOverride;
  }>;
  designWorkbenchChat?: { messages: CourseProjectChatMessage[] };
}

export interface PatchProjectResult {
  project: CourseProject;
  idMapping?: Record<string, string>;
}

export async function listTeacherProjects(
  fetcher: typeof fetch = fetch,
): Promise<TeacherProjectListItem[]> {
  const response = await fetcher('/api/extends/teacher/projects');
  const json = (await response.json()) as {
    success?: boolean;
    projects?: TeacherProjectListItem[];
  };
  if (!response.ok || !json.success || !Array.isArray(json.projects)) {
    throw new Error(`Failed to list teacher projects: HTTP ${response.status}`);
  }
  return json.projects;
}

export async function createTeacherProject(
  input: CreateProjectInput,
  fetcher: typeof fetch = fetch,
): Promise<CourseProject> {
  const response = await fetcher('/api/extends/teacher/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = (await response.json()) as { success?: boolean; project?: CourseProject };
  if (!response.ok || !json.success || !json.project) {
    throw new Error(`Failed to create teacher project: HTTP ${response.status}`);
  }
  return json.project;
}

export async function deleteTeacherProject(
  projectId: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const response = await fetcher(`/api/extends/teacher/projects/${encodeURIComponent(projectId)}`, {
    method: 'DELETE',
  });
  const json = (await response.json()) as { success?: boolean };
  if (!response.ok || !json.success) {
    throw new Error(`Failed to delete teacher project: HTTP ${response.status}`);
  }
}

export async function patchTeacherProject(
  projectId: string,
  input: PatchProjectInput,
  fetcher: typeof fetch = fetch,
): Promise<PatchProjectResult> {
  const response = await fetcher(`/api/extends/teacher/projects/${encodeURIComponent(projectId)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = (await response.json()) as {
    success?: boolean;
    project?: CourseProject;
    idMapping?: Record<string, string>;
  };
  if (!response.ok || !json.success || !json.project) {
    throw new Error(`Failed to patch teacher project: HTTP ${response.status}`);
  }
  return { project: json.project, idMapping: json.idMapping };
}

export function chaptersToPatch(
  chapters: ChapterSnapshot[],
): NonNullable<PatchProjectInput['chapters']> {
  return chapters.map((chapter) => ({
    id: chapter.id,
    title: chapter.title,
    learningObjectives: chapter.learningObjectives,
    summary: chapter.summary,
    deepSearchEnabled: chapter.deepSearchEnabled,
    knowledgeNodeIds: chapter.knowledgeNodeIds,
    ...(chapter.slideTemplateId !== undefined ? { slideTemplateId: chapter.slideTemplateId } : {}),
    ...(chapter.generationMode !== undefined ? { generationMode: chapter.generationMode } : {}),
    ...(chapter.generationProfileOverride !== undefined
      ? { generationProfileOverride: chapter.generationProfileOverride }
      : {}),
  }));
}
