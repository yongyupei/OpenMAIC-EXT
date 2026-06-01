/**
 * @extends-from tests/lecture-timeline.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, it } from 'vitest';
import {
  buildLecturePlan,
  canonicalSpeechAudioId,
  getPlaybackSpeechActions,
  lecturePlanSpeechCues,
} from '@/lib/lecture-timeline';
import type { Scene } from '@/lib/types/stage';

function sceneWithActions(
  order: number,
  actions: Array<{ id: string; type: string; text?: string }>,
): Scene {
  return {
    id: `scene-${order}`,
    stageId: 'c1',
    type: 'slide',
    title: `S${order}`,
    order,
    content: { type: 'slide', canvas: { id: `slide-${order}`, elements: [] } },
    actions: actions as Scene['actions'],
  } as unknown as Scene;
}

describe('buildLecturePlan', () => {
  it('preserves speech order within actions (skips non-speech between)', () => {
    const scene = sceneWithActions(1, [
      { id: 'sp1', type: 'spotlight' },
      { id: 'n1', type: 'speech', text: 'first' },
      { id: 'lz1', type: 'laser' },
      { id: 'n2', type: 'speech', text: 'second' },
    ]);
    const cues = lecturePlanSpeechCues(buildLecturePlan([scene]));
    expect(cues.map((c) => c.actionId)).toEqual(['n1', 'n2']);
    expect(cues.map((c) => c.text)).toEqual(['first', 'second']);
  });

  it('sorts scenes by order', () => {
    const plan = buildLecturePlan([
      sceneWithActions(2, [{ id: 'a', type: 'speech', text: 'b' }]),
      sceneWithActions(1, [{ id: 'b', type: 'speech', text: 'a' }]),
    ]);
    expect(plan.map((c) => c.sceneOrder)).toEqual([1, 2]);
  });

  it('emits static cue when scene has no speech', () => {
    const plan = buildLecturePlan([sceneWithActions(1, [{ id: 'sp', type: 'spotlight' }])]);
    expect(plan).toHaveLength(1);
    expect(plan[0].kind).toBe('static');
  });

  it('uses canonical audio id when missing', () => {
    const scene = sceneWithActions(3, [{ id: 'speech-1', type: 'speech', text: 'hi' }]);
    expect(canonicalSpeechAudioId(scene, getPlaybackSpeechActions(scene)[0]!)).toBe(
      'tts_s3_speech-1',
    );
    const cue = lecturePlanSpeechCues(buildLecturePlan([scene]))[0]!;
    expect(cue.audioId).toBe('tts_s3_speech-1');
  });
});
