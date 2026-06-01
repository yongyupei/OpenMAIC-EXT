/**
 * @extends-from tests/server/video-export-runner.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { describe, expect, it } from 'vitest';
import { classroomNeedsClientAssets } from '@/lib/server/video-export-runner';
import type { Scene } from '@/lib/types/stage';

describe('classroomNeedsClientAssets', () => {
  it('returns true when speech has text without audioUrl', () => {
    const scenes = [
      {
        id: 's1',
        actions: [{ type: 'speech', text: 'hello' }],
      },
    ] as Scene[];
    expect(classroomNeedsClientAssets(scenes)).toBe(true);
  });

  it('returns true when speech has audioId without audioUrl', () => {
    const scenes = [
      {
        id: 's1',
        actions: [{ type: 'speech', text: 'hello', audioId: 'tts_1' }],
      },
    ] as Scene[];
    expect(classroomNeedsClientAssets(scenes)).toBe(true);
  });

  it('returns false when speech uses server audioUrl', () => {
    const scenes = [
      {
        id: 's1',
        actions: [{ type: 'speech', text: 'hello', audioUrl: '/api/classroom-media/x/a.mp3' }],
      },
    ] as Scene[];
    expect(classroomNeedsClientAssets(scenes)).toBe(false);
  });
});
