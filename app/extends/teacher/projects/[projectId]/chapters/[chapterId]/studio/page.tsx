/**
 * @extends-from app/teacher/projects/[projectId]/chapters/[chapterId]/studio/page.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
import { redirect } from 'next/navigation';
import { canAccessChapterStudio } from '@/lib/teacher/chapter-generate-precheck';
import { readTeacherProject } from '@/lib/teacher/course-project-storage';
import { buildChapterGeneratePath, buildTeacherDesignPath } from '@/lib/teacher/routes';
import { ChapterStudioShell } from '@/components/teacher/chapter-studio-shell';

type PageProps = {
  params: Promise<{ projectId: string; chapterId: string }>;
};

export default async function ChapterStudioPage({ params }: PageProps) {
  const { projectId, chapterId } = await params;
  const project = await readTeacherProject(projectId);

  if (!project) {
    redirect(buildTeacherDesignPath(projectId));
  }

  const chapterClassroom = project.chapterClassrooms?.[chapterId];
  if (!canAccessChapterStudio(chapterClassroom)) {
    redirect(buildChapterGeneratePath(projectId, chapterId));
  }

  const chapters = project.outline?.chapters ?? [];
  const chapter = chapters.find((c) => c.id === chapterId);
  if (!chapter) {
    redirect(buildTeacherDesignPath(projectId));
  }

  const chapterOrder = chapters.findIndex((c) => c.id === chapterId) + 1;

  return (
    <ChapterStudioShell
      project={project}
      chapterId={chapterId}
      classroomId={chapterClassroom!.classroomId}
      chapterTitle={chapter.title}
      chapterOrder={chapterOrder}
    />
  );
}
