/**
 * @extends-from components/teacher/html-slide-scene-preview.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Scene } from '@/lib/types/stage';
import { useWidgetIframeStore } from '@/lib/store/widget-iframe';
import { patchHtmlForIframe } from '@/lib/utils/iframe';
import { runHtmlSlideAutoplay } from '@/lib/teacher/html-slide-autoplay';
import { ActionEngine } from '@/lib/action/engine';
import { useStageStore } from '@/lib/store/stage';
import { createAudioPlayer } from '@/lib/utils/audio-player';

interface HtmlSlideScenePreviewProps {
  readonly scene: Scene;
}

export function HtmlSlideScenePreview({ scene }: HtmlSlideScenePreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const audioPlayerRef = useRef(createAudioPlayer());
  const [autoplayActive, setAutoplayActive] = useState(false);
  const registerIframe = useWidgetIframeStore((state) => state.registerIframe);
  const setActiveScene = useWidgetIframeStore((state) => state.setActiveScene);

  const htmlSlide =
    scene.content.type === 'slide' ? scene.content.htmlSlide : undefined;

  const patchedHtml = useMemo(
    () => (htmlSlide?.html ? patchHtmlForIframe(htmlSlide.html) : undefined),
    [htmlSlide],
  );

  const sendMessageToIframe = useCallback((type: string, payload: Record<string, unknown>) => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type, ...payload }, '*');
    }
  }, []);

  useEffect(() => {
    registerIframe(scene.id, sendMessageToIframe);
    setActiveScene(scene.id);
    return () => {
      registerIframe(scene.id, null);
    };
  }, [scene.id, registerIframe, sendMessageToIframe, setActiveScene]);

  useEffect(() => {
    const actions = scene.actions ?? [];
    if (actions.length === 0) return;

    let aborted = false;
    const actionEngine = new ActionEngine(
      useStageStore,
      audioPlayerRef.current,
      sendMessageToIframe,
    );

    const audioPlayer = audioPlayerRef.current;
    let autoplayStarted = false;

    void Promise.resolve().then(() => {
      if (aborted) return;
      autoplayStarted = true;
      setAutoplayActive(true);
      return runHtmlSlideAutoplay(actions, {
        playSpeech: (action) => actionEngine.execute(action),
        sendToIframe: sendMessageToIframe,
        shouldAbort: () => aborted,
      });
    }).finally(() => {
      if (!aborted && autoplayStarted) setAutoplayActive(false);
    });

    return () => {
      aborted = true;
      audioPlayer.stop();
      actionEngine.dispose();
      setAutoplayActive(false);
    };
  }, [scene.id, scene.actions, sendMessageToIframe]);

  return (
    <div className="relative h-full w-full">
      {autoplayActive && (
        <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-md bg-black/50 px-2 py-1 text-xs text-white">
          Auto preview
        </div>
      )}
      <iframe
        ref={iframeRef}
        srcDoc={patchedHtml}
        className="absolute inset-0 h-full w-full border-0"
        title={`HTML Slide ${scene.id}`}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
    </div>
  );
}
