/**
 * @extends-from components/video-export/export-video-render-client.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { useMemo } from 'react';
import type { Scene } from '@/lib/types/stage';
import { VIDEO_HEIGHT, VIDEO_WIDTH } from '@/lib/video-export/constants';
import { SlideExportViewport } from '@/components/video-export/slide-export-viewport';
import { VideoExportSummaryCard } from '@/components/video-export/summary-card';

declare global {
  interface Window {
    __exportVideoReady?: boolean;
    __exportVideoSceneId?: string;
  }
}

export function ExportVideoRenderClient({
  classroomId,
  scenes,
  sceneId,
}: {
  classroomId: string;
  scenes: Scene[];
  sceneId: string;
}) {
  const scene = useMemo(
    () => scenes.find((item) => item.id === sceneId) ?? scenes[0],
    [scenes, sceneId],
  );

  if (!scene) {
    return (
      <div
        id="export-video-root"
        data-export-root="true"
        style={{ width: VIDEO_WIDTH, height: VIDEO_HEIGHT }}
        className="flex items-center justify-center bg-white text-slate-500"
      >
        Scene not found
      </div>
    );
  }

  if (scene.type === 'slide') {
    return <SlideExportViewport classroomId={classroomId} scenes={scenes} sceneId={scene.id} />;
  }

  return (
    <div
      id="export-video-root"
      data-export-root="true"
      style={{ width: VIDEO_WIDTH, height: VIDEO_HEIGHT }}
    >
      <VideoExportSummaryCard scene={scene} />
    </div>
  );
}
