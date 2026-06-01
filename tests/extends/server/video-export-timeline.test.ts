/**
 * @extends-from tests/server/video-export-timeline.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, it, expect } from 'vitest';
import { buildVideoTimeline, VideoExportValidationError } from '@/lib/server/video-export/timeline';
import type { Scene } from '@/lib/types/stage';

function slideScene(
  order: number,
  speech?: { id: string; text: string; audioUrl?: string; audioId?: string },
): Scene {
  return {
    id: `scene-${order}`,
    stageId: 'class-1',
    type: 'slide',
    title: `Slide ${order}`,
    order,
    content: { type: 'slide', canvas: { id: `slide-${order}`, elements: [] } },
    actions: speech
      ? [
          {
            id: speech.id,
            type: 'speech',
            text: speech.text,
            audioUrl: speech.audioUrl,
            audioId: speech.audioId,
          },
        ]
      : [],
  } as unknown as Scene;
}

function quizScene(order: number, withSpeech: boolean): Scene {
  return {
    id: `quiz-${order}`,
    stageId: 'class-1',
    type: 'quiz',
    title: `Quiz ${order}`,
    order,
    content: {
      type: 'quiz',
      questions: [{ id: 'q1', type: 'single', question: 'Sample question?' }],
    },
    actions: withSpeech
      ? [{ id: 's1', type: 'speech', text: 'Explain', audioUrl: '/audio/s1.mp3' }]
      : [],
  } as unknown as Scene;
}

describe('buildVideoTimeline', () => {
  it('builds segments with probed duration when audio exists', async () => {
    const timeline = await buildVideoTimeline({
      scenes: [slideScene(1, { id: 'a1', text: 'hello', audioUrl: '/a.mp3' })],
      assetsDir: '/tmp/job-1',
      probeDurationMs: async () => 3200,
    });
    expect(timeline.segments).toHaveLength(1);
    expect(timeline.segments[0].durationMs).toBe(3200);
    expect(timeline.width).toBe(1920);
    expect(timeline.height).toBe(1080);
  });

  it('uses default duration for slide without speech', async () => {
    const timeline = await buildVideoTimeline({
      scenes: [slideScene(1)],
      assetsDir: '/tmp/job-1',
    });
    expect(timeline.segments).toHaveLength(1);
    expect(timeline.segments[0].durationMs).toBe(3000);
    expect(timeline.segments[0].renderMode).toBe('slide');
  });

  it('uses default summary duration for quiz without speech', async () => {
    const timeline = await buildVideoTimeline({
      scenes: [quizScene(1, false)],
      assetsDir: '/tmp/job-1',
    });
    expect(timeline.segments[0].durationMs).toBe(5000);
    expect(timeline.segments[0].renderMode).toBe('summary');
  });

  it('throws when speech text exists but no resolvable audio', async () => {
    await expect(
      buildVideoTimeline({
        scenes: [slideScene(1, { id: 'a1', text: 'hello' })],
        assetsDir: '/tmp/job-1',
      }),
    ).rejects.toBeInstanceOf(VideoExportValidationError);
  });

  it('sorts scenes by order', async () => {
    const timeline = await buildVideoTimeline({
      scenes: [slideScene(2), slideScene(1)],
      assetsDir: '/tmp/job-1',
    });
    expect(timeline.segments[0].sceneId).toBe('scene-1');
    expect(timeline.segments[1].sceneId).toBe('scene-2');
  });

  it('creates one segment per speech in action order', async () => {
    const scene = {
      ...slideScene(1),
      actions: [
        { id: 's1', type: 'speech', text: 'part one', audioUrl: '/a1.mp3' },
        { id: 'spot', type: 'spotlight', elementId: 'el-1' },
        { id: 's2', type: 'speech', text: 'part two', audioUrl: '/a2.mp3' },
      ],
    } as unknown as Scene;

    const timeline = await buildVideoTimeline({
      scenes: [scene],
      assetsDir: '/tmp/job-1',
      probeDurationMs: async (path) => (path.includes('a2') ? 2000 : 1000),
    });

    expect(timeline.segments).toHaveLength(2);
    expect(timeline.segments[0].actionId).toBe('s1');
    expect(timeline.segments[0].durationMs).toBe(1000);
    expect(timeline.segments[1].actionId).toBe('s2');
    expect(timeline.segments[1].durationMs).toBe(2000);
    expect(timeline.durationMs).toBe(3000);
  });
});
