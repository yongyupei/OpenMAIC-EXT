/**
 * @extends-from lib/teacher/preview-helpers.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import type { CourseChapter, CourseProject } from '@/lib/teacher/course-types';
import type { UserRequirements } from '@/lib/types/generation';

const DEFAULT_SCENE_COUNT = 3;

export interface ChapterHint {
  title: string;
  learningObjectives: string[];
  summary?: string;
  targetSceneCount: number;
}

export function buildChapterHints(chapters: CourseChapter[]): ChapterHint[] {
  return chapters.map((ch) => ({
    title: ch.title,
    learningObjectives: ch.learningObjectives,
    summary: ch.summary,
    targetSceneCount: ch.sceneOutlines.length > 0 ? ch.sceneOutlines.length : DEFAULT_SCENE_COUNT,
  }));
}

/**
 * Builds a minimal UserRequirements from the teacher project for use in
 * the preview generation pipeline.
 *
 * Note: Only the requirement text is populated. Student-specific fields
 * (userNickname, userBio, webSearch, interactiveMode) are intentionally
 * omitted — they are not applicable in the teacher-driven generation context.
 */
export function buildRequirementsFromProject(project: CourseProject): UserRequirements {
  const base = project.overview ?? project.requirements.requirement ?? project.title;

  const lines = [
    base,
    project.targetAudience ? `目标受众：${project.targetAudience}` : null,
    project.durationMinutes ? `课程时长：${project.durationMinutes} 分钟` : null,
  ].filter((l): l is string => typeof l === 'string' && l.length > 0);

  return { requirement: lines.join('\n') };
}

export function buildChapterStructureText(hints: ChapterHint[]): string {
  if (hints.length === 0) return '';

  const chapterLines = hints
    .map((ch, i) => {
      const lines = [
        `第 ${i + 1} 章：${ch.title}`,
        `  学习目标：${ch.learningObjectives.join('；')}`,
        ch.summary ? `  章节摘要：${ch.summary}` : null,
        `  期望场景数：${ch.targetSceneCount}`,
      ].filter((l): l is string => l !== null);
      return lines.join('\n');
    })
    .join('\n\n');

  return [
    '【教师预设章节结构】（请严格按照此章节顺序生成场景大纲）',
    '',
    chapterLines,
    '',
    '请为每个章节生成对应数量的场景大纲，场景类型（slide/quiz/pbl）由你根据学习目标自主决定，内容需贴合章节主题和学习目标。',
  ].join('\n');
}
