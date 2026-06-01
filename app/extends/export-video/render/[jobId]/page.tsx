/**
 * @extends-from app/export-video/render/[jobId]/page.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
import { notFound } from 'next/navigation';
import { readClassroom } from '@/lib/server/classroom-storage';
import { readVideoExportJob } from '@/lib/server/video-export-job-store';
import { verifyExportRenderToken } from '@/lib/server/video-export/render-token';
import { ExportVideoRenderClient } from '@/components/video-export/export-video-render-client';
import { ThemeProvider } from '@/lib/hooks/use-theme';
import { MediaStageProvider } from '@/lib/contexts/media-stage-context';

type PageProps = {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ token?: string; sceneId?: string }>;
};

export default async function ExportVideoRenderPage({ params, searchParams }: PageProps) {
  const { jobId } = await params;
  const { token, sceneId } = await searchParams;

  if (!token) {
    notFound();
  }

  const job = await readVideoExportJob(jobId);
  if (!job) {
    notFound();
  }

  if (!verifyExportRenderToken(token, jobId, job.classroomId)) {
    notFound();
  }

  const classroom = await readClassroom(job.classroomId);
  if (!classroom) {
    notFound();
  }

  const scenes = [...classroom.scenes].sort((a, b) => a.order - b.order);
  const activeSceneId =
    sceneId && scenes.some((scene) => scene.id === sceneId) ? sceneId : scenes[0]?.id;

  if (!activeSceneId) {
    notFound();
  }

  return (
    <ThemeProvider>
      <MediaStageProvider value={job.classroomId}>
        <main className="min-h-screen bg-black">
          <ExportVideoRenderClient
            classroomId={job.classroomId}
            scenes={scenes}
            sceneId={activeSceneId}
          />
        </main>
      </MediaStageProvider>
    </ThemeProvider>
  );
}
