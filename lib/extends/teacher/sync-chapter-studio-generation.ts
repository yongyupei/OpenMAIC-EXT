/**
 * Sync server-persisted chapter classroom data into the stage store for live
 * generation preview inside teacher chapter studio (mirrors student classroom UX).
 */
import {
  ensureGenerationSnapshotsOnLoad,
  seedAuthoritativeGenerationSnapshotsFromServer,
} from '@/lib/generation/slide-generation-snapshot';
import { useStageStore } from '@/lib/store/stage';
import type { SceneOutline } from '@/lib/types/generation';
import type { Scene, Stage } from '@/lib/types/stage';

export interface ClassroomPayload {
  readonly id: string;
  readonly stage: Stage;
  readonly scenes: Scene[];
}

function normalizeClassroomPayload(
  classroomId: string,
  payload: ClassroomPayload,
): { stage: Stage; scenes: Scene[] } {
  if (!payload.stage || !Array.isArray(payload.scenes)) {
    throw new Error('Invalid classroom payload');
  }
  if (payload.id !== classroomId) {
    throw new Error('Classroom data does not match requested id');
  }

  const stage: Stage =
    payload.stage.id === classroomId ? payload.stage : { ...payload.stage, id: classroomId };
  const scenes: Scene[] = payload.scenes.map((scene) =>
    scene.stageId === classroomId ? scene : { ...scene, stageId: classroomId },
  );

  return { stage, scenes };
}

export function computePendingSceneOutlines(
  sceneOutlines: readonly SceneOutline[],
  scenes: readonly Scene[],
): SceneOutline[] {
  const completedOrders = new Set(scenes.map((scene) => scene.order));
  return sceneOutlines.filter((outline) => !completedOrders.has(outline.order));
}

export function applyChapterStudioGenerationState(
  classroomId: string,
  payload: ClassroomPayload,
  sceneOutlines: readonly SceneOutline[],
  options: {
    readonly preferredSceneId?: string | null;
    readonly saveToIndexedDb?: boolean;
    readonly generationActive: boolean;
    readonly generationFailed?: boolean;
  },
): { stage: Stage; scenes: Scene[]; pendingOutlines: SceneOutline[] } {
  const { stage, scenes: rawScenes } = normalizeClassroomPayload(classroomId, payload);
  const withSnapshots = ensureGenerationSnapshotsOnLoad(rawScenes);
  const scenes = seedAuthoritativeGenerationSnapshotsFromServer(withSnapshots, withSnapshots);
  const pendingOutlines = computePendingSceneOutlines(sceneOutlines, scenes);

  const store = useStageStore.getState();
  const previousSceneId = store.currentSceneId;

  store.setStage(stage);
  store.setScenes(scenes);
  store.setOutlines([...sceneOutlines]);
  store.setGeneratingOutlines(pendingOutlines);

  if (options.generationFailed && pendingOutlines.length > 0) {
    store.setGenerationStatus('error');
    store.clearFailedOutlines();
    store.addFailedOutline(pendingOutlines[0]!);
  } else if (options.generationActive && pendingOutlines.length > 0) {
    store.setGenerationStatus('generating');
    store.clearFailedOutlines();
  } else {
    store.setGenerationStatus('idle');
    store.clearFailedOutlines();
  }

  const resolvedSceneId =
    options.preferredSceneId && scenes.some((scene) => scene.id === options.preferredSceneId)
      ? options.preferredSceneId
      : previousSceneId && scenes.some((scene) => scene.id === previousSceneId)
        ? previousSceneId
        : (scenes[0]?.id ?? null);

  useStageStore.setState({ currentSceneId: resolvedSceneId });

  if (options.saveToIndexedDb !== false) {
    void store.saveToStorage();
  }

  return { stage, scenes, pendingOutlines };
}

export async function fetchClassroomPayload(classroomId: string): Promise<ClassroomPayload> {
  const response = await fetch(`/api/classroom?id=${encodeURIComponent(classroomId)}`);
  if (!response.ok) {
    throw new Error(`Classroom fetch failed: ${response.status}`);
  }

  const json = (await response.json()) as {
    success?: boolean;
    classroom?: ClassroomPayload;
  };
  if (!json.success || !json.classroom) {
    throw new Error('Classroom not found');
  }

  return json.classroom;
}

export async function syncChapterStudioFromServer(
  classroomId: string,
  sceneOutlines: readonly SceneOutline[],
  options: {
    readonly preferredSceneId?: string | null;
    readonly saveToIndexedDb?: boolean;
    readonly generationActive: boolean;
    readonly generationFailed?: boolean;
  },
): Promise<{ stage: Stage; scenes: Scene[]; pendingOutlines: SceneOutline[] }> {
  const payload = await fetchClassroomPayload(classroomId);
  return applyChapterStudioGenerationState(classroomId, payload, sceneOutlines, options);
}
