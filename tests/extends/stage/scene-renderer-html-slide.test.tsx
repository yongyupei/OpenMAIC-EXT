/**
 * @extends-from tests/stage/scene-renderer-html-slide.test.tsx
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { SceneRenderer } from '@/components/stage/scene-renderer';
import type { Scene } from '@/lib/types/stage';

vi.mock('@/components/slide-renderer/Editor', () => ({
  SlideEditor: () => <div data-testid="canvas-slide">canvas slide</div>,
}));

vi.mock('@/components/teacher/html-slide-scene-preview', () => ({
  HtmlSlideScenePreview: () => <iframe title="HTML Slide preview-scene" />,
}));

function htmlSlideScene(): Scene {
  return {
    id: 'preview-scene',
    stageId: 'stage-1',
    type: 'slide',
    title: 'HTML slide',
    order: 0,
    content: {
      type: 'slide',
      canvas: {
        id: 'slide_1',
        viewportSize: 1000,
        viewportRatio: 0.5625,
        theme: {
          backgroundColor: '#ffffff',
          themeColors: ['#000000'],
          fontColor: '#000000',
          fontName: 'Arial',
        },
        elements: [],
      },
      htmlSlide: {
        html: '<html><body><h1>Motion</h1></body></html>',
      },
    },
  };
}

describe('SceneRenderer htmlSlidePreview', () => {
  it('does not render HTML iframe preview when htmlSlidePreview is false', () => {
    const markup = renderToStaticMarkup(
      <SceneRenderer scene={htmlSlideScene()} mode="playback" htmlSlidePreview={false} />,
    );

    expect(markup).toContain('data-testid="canvas-slide"');
    expect(markup).not.toContain('title="HTML Slide');
  });

  it('renders HTML iframe preview when htmlSlidePreview is true and htmlSlide exists', () => {
    const markup = renderToStaticMarkup(
      <SceneRenderer scene={htmlSlideScene()} mode="playback" htmlSlidePreview />,
    );

    expect(markup).toContain('title="HTML Slide preview-scene"');
    expect(markup).not.toContain('data-testid="canvas-slide"');
  });
});
