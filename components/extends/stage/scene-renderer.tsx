/**
 * @extends-from components/stage/scene-renderer.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { useMemo } from 'react';
import type { Scene, StageMode } from '@/lib/types/stage';
import { SlideEditor as SlideRenderer } from '@/components/slide-renderer/Editor';
import { QuizView } from '@/components/scene-renderers/quiz-view';
import { InteractiveRenderer } from '@/components/scene-renderers/interactive-renderer';
import { PBLRenderer } from '@/components/scene-renderers/pbl-renderer';
import { QuizEditor } from '@/components/course-editor/quiz-editor';
import { HtmlSlideScenePreview } from '@/components/teacher/html-slide-scene-preview';

interface SceneRendererProps {
  readonly scene: Scene;
  readonly mode: StageMode;
  readonly editable?: boolean;
  /** Teacher Studio only: render HTML motion slide in iframe when content has htmlSlide */
  readonly htmlSlidePreview?: boolean;
}

export function SceneRenderer({
  scene,
  mode,
  editable = false,
  htmlSlidePreview = false,
}: SceneRendererProps) {
  const renderer = useMemo(() => {
    switch (scene.type) {
      case 'slide':
        if (scene.content.type !== 'slide') return <div>Invalid slide content</div>;
        if (htmlSlidePreview && scene.content.htmlSlide) {
          return <HtmlSlideScenePreview scene={scene} />;
        }
        return <SlideRenderer mode={editable ? 'autonomous' : mode} />;
      case 'quiz':
        if (scene.content.type !== 'quiz') return <div>Invalid quiz content</div>;
        if (editable) return <QuizEditor />;
        return <QuizView key={scene.id} questions={scene.content.questions} sceneId={scene.id} />;
      case 'interactive':
        if (scene.content.type !== 'interactive') return <div>Invalid interactive content</div>;
        return <InteractiveRenderer content={scene.content} sceneId={scene.id} />;
      case 'pbl':
        if (scene.content.type !== 'pbl') return <div>Invalid PBL content</div>;
        return <PBLRenderer content={scene.content} mode={mode} sceneId={scene.id} />;
      default:
        return <div>Unknown scene type</div>;
    }
  }, [scene, mode, editable, htmlSlidePreview]);

  return (
    <div className="w-full h-full" key={`${scene.id}-${scene.updatedAt}`}>
      {renderer}
    </div>
  );
}
