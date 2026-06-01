/**
 * @extends-from tests/teacher/hydrate-classroom-to-stage.test.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { hydrateClassroomToStageStore } from '@/lib/teacher/hydrate-classroom-to-stage';
import { useStageStore } from '@/lib/store/stage';
import type { Scene, Stage } from '@/lib/types/stage';

const stage: Stage = {
  id: 'proj-ch-ch1',
  name: 'Chapter 1',
  createdAt: 1,
  updatedAt: 1,
};

const scenes: Scene[] = [
  {
    id: 'scene-a',
    stageId: 'proj-ch-ch1',
    type: 'slide',
    title: 'Slide',
    order: 0,
    content: {
      type: 'slide',
      canvas: {
        id: 'canvas-a',
        viewportSize: 1000,
        viewportRatio: 0.5625,
        theme: {
          backgroundColor: '#ffffff',
          themeColors: ['#5b9bd5'],
          fontColor: '#333333',
          fontName: 'Microsoft YaHei',
        },
        elements: [],
      },
    },
    actions: [],
    createdAt: 1,
    updatedAt: 1,
  },
];

describe('hydrateClassroomToStageStore', () => {
  beforeEach(() => {
    useStageStore.getState().clearStore();
    vi.restoreAllMocks();
  });

  it('loads scenes from the classroom API into the stage store', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        classroom: { id: 'proj-ch-ch1', stage, scenes },
      }),
    } as Response);

    const saveMock = vi
      .spyOn(useStageStore.getState(), 'saveToStorage')
      .mockResolvedValue(undefined);

    const result = await hydrateClassroomToStageStore('proj-ch-ch1', { clearStoreFirst: true });

    expect(fetchMock).toHaveBeenCalledWith('/api/classroom?id=proj-ch-ch1');
    expect(result.scenes).toHaveLength(1);
    expect(useStageStore.getState().scenes).toHaveLength(1);
    expect(useStageStore.getState().currentSceneId).toBe('scene-a');
    expect(saveMock).toHaveBeenCalled();
  });
});
