/**
 * @extends-from lib/store/index.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import { useCanvasStore } from '@/lib/store/canvas';
import { useKeyboardStore } from '@/lib/store/keyboard';
import { useSnapshotStore } from '@/lib/store/snapshot';
import { useStageStore } from '@/lib/store/stage';

import { useSettingsStore } from './settings';

export {
  useCanvasStore,
  useStageStore,
  useSnapshotStore,
  useKeyboardStore,
  useSettingsStore,
};

export { SceneProvider, useSceneData, useSceneSelector } from '@/lib/contexts/scene-context';
