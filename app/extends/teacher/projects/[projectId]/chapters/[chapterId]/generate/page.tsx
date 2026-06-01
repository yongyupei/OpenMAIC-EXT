/**
 * @extends-from app/teacher/projects/[projectId]/chapters/[chapterId]/generate/page.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
import { redirect } from 'next/navigation';
import { shouldRedirectGeneratePageToStudio } from '@/lib/teacher/chapter-generate-precheck';
import { readTeacherProject } from '@/lib/teacher/course-project-storage';
import { buildChapterStudioPath, buildTeacherDesignPath } from '@/lib/teacher/routes';
import { ChapterGenerateShell } from '@/components/teacher/chapter-generate-shell';

type PageProps = {
  params: Promise<{ projectId: string; chapterId: string }>;
  searchParams: Promise<{ regenerate?: string; resume?: string }>;
};

export default async function ChapterGeneratePage({ params, searchParams }: PageProps) {
  const { projectId, chapterId } = await params;
  const { regenerate: regenerateParam, resume: resumeParam } = await searchParams;
  const isRegenerate = regenerateParam === '1';
  const isResume = resumeParam === '1';

  const project = await readTeacherProject(projectId);

  if (!project) {
    redirect(buildTeacherDesignPath(projectId));
  }

  const existing = project.chapterClassrooms?.[chapterId];
  if (shouldRedirectGeneratePageToStudio(existing?.status, { regenerate: isRegenerate })) {
    redirect(buildChapterStudioPath(projectId, chapterId));
  }

  const chapters = project.outline?.chapters ?? [];
  const chapter = chapters.find((c) => c.id === chapterId);
  if (!chapter) {
    redirect(buildTeacherDesignPath(projectId));
  }

  const chapterOrder = chapters.findIndex((c) => c.id === chapterId) + 1;

  // Poll-only when a job is already running — unless user asked to regenerate (new POST).
  const isAlreadyGenerating = existing?.status === 'generating';
  const autoStart = isRegenerate || isResume || !isAlreadyGenerating;

  return (
    <ChapterGenerateShell
      projectId={projectId}
      chapterId={chapterId}
      chapterTitle={chapter.title}
      chapterOrder={chapterOrder}
      autoStart={autoStart}
    />
  );
}
