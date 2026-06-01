/**
 * @extends-from lib/teacher/project-list-summary.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import type { CourseProject } from '@/lib/teacher/course-types';

/** Lightweight project row for list APIs and cards (omits chat, scenes, outline bodies). */
export type TeacherProjectListItem = Pick<
  CourseProject,
  'id' | 'title' | 'status' | 'createdAt' | 'updatedAt' | 'chapterCount' | 'publishedClassroomId'
> & {
  readonly hasDesignChat: boolean;
};

export function toTeacherProjectListItem(project: CourseProject): TeacherProjectListItem {
  const {
    designWorkbenchChat: _chat,
    generatedScenes: _scenes,
    outline: _outline,
    ...rest
  } = project;
  void _chat;
  void _scenes;
  void _outline;
  return {
    id: rest.id,
    title: rest.title,
    status: rest.status,
    createdAt: rest.createdAt,
    updatedAt: rest.updatedAt,
    chapterCount: rest.chapterCount,
    publishedClassroomId: rest.publishedClassroomId,
    hasDesignChat: (project.designWorkbenchChat?.messages.length ?? 0) > 0,
  };
}

export function toTeacherProjectListItems(projects: CourseProject[]): TeacherProjectListItem[] {
  return projects.map(toTeacherProjectListItem);
}
