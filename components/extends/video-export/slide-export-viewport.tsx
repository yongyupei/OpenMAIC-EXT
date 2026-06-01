/**
 * @extends-from components/video-export/slide-export-viewport.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { useEffect, useRef } from 'react';
import { ScreenCanvas } from '@/components/slide-renderer/Editor/ScreenCanvas';
import { SceneProvider } from '@/lib/contexts/scene-context';
import { useStageStore } from '@/lib/store/stage';
import { useCanvasStore } from '@/lib/store/canvas';
import type { Scene, Stage } from '@/lib/types/stage';
import { VIDEO_HEIGHT, VIDEO_WIDTH } from '@/lib/video-export/constants';

const VIEWPORT_SIZE = 1000;
const VIEWPORT_RATIO = VIDEO_HEIGHT / VIDEO_WIDTH;

export function SlideExportViewport({
  classroomId,
  scenes,
  sceneId,
  onReady,
}: {
  classroomId: string;
  scenes: Scene[];
  sceneId: string;
  onReady?: () => void;
}) {
  const initializedRef = useRef(false);

  useEffect(() => {
    const stage: Stage = {
      id: classroomId,
      name: 'export',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    useStageStore.getState().setStage(stage);
    useStageStore.setState({ scenes, currentSceneId: sceneId });

    const scale = VIDEO_WIDTH / VIEWPORT_SIZE;
    useCanvasStore.setState({
      viewportSize: VIEWPORT_SIZE,
      viewportRatio: VIEWPORT_RATIO,
      canvasScale: scale,
      canvasPercentage: 100,
    });
    initializedRef.current = true;
  }, [classroomId, scenes, sceneId]);

  useEffect(() => {
    if (!initializedRef.current) return;
    useStageStore.getState().setCurrentSceneId(sceneId);
    const timer = window.setTimeout(() => {
      window.__exportVideoReady = true;
      onReady?.();
    }, 800);
    return () => {
      window.clearTimeout(timer);
      window.__exportVideoReady = false;
    };
  }, [sceneId, onReady]);

  return (
    <div
      id="export-video-root"
      data-export-root="true"
      className="relative overflow-hidden bg-white"
      style={{ width: VIDEO_WIDTH, height: VIDEO_HEIGHT }}
    >
      <SceneProvider>
        <div className="h-full w-full">
          <ScreenCanvas />
        </div>
      </SceneProvider>
    </div>
  );
}
