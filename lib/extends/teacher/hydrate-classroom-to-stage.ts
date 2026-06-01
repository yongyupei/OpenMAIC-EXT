/**
 * @extends-from lib/teacher/hydrate-classroom-to-stage.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import {
  ensureGenerationSnapshotsOnLoad,
  seedAuthoritativeGenerationSnapshotsFromServer,
} from '@/lib/generation/slide-generation-snapshot';
import { useStageStore } from '@/lib/store/stage';
import type { Scene, Stage } from '@/lib/types/stage';

export interface HydrateClassroomToStageOptions {
  /** When true, clears in-memory store before applying server payload. */
  readonly clearStoreFirst?: boolean;
  readonly preferredSceneId?: string | null;
  /** Persist hydrated payload to IndexedDB after apply (default true). */
  readonly saveToIndexedDb?: boolean;
}

function normalizeClassroomPayload(
  classroomId: string,
  payload: { id: string; stage: Stage; scenes: Scene[] },
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

/**
 * Loads classroom JSON from the server and applies it to the stage store.
 * Teacher Studio uses this as the source of truth after generation/regenerate.
 */
export async function hydrateClassroomToStageStore(
  classroomId: string,
  options: HydrateClassroomToStageOptions = {},
): Promise<{ stage: Stage; scenes: Scene[] }> {
  const { clearStoreFirst = false, preferredSceneId, saveToIndexedDb = true } = options;

  if (clearStoreFirst) {
    useStageStore.getState().clearStore();
  }

  const response = await fetch(`/api/classroom?id=${encodeURIComponent(classroomId)}`);
  if (!response.ok) {
    throw new Error(`Classroom fetch failed: ${response.status}`);
  }

  const json = (await response.json()) as {
    success?: boolean;
    classroom?: { id: string; stage: Stage; scenes: Scene[] };
  };
  if (!json.success || !json.classroom) {
    throw new Error('Classroom not found');
  }

  const { stage, scenes: rawScenes } = normalizeClassroomPayload(classroomId, json.classroom);
  const withSnapshots = ensureGenerationSnapshotsOnLoad(rawScenes);
  const scenes = seedAuthoritativeGenerationSnapshotsFromServer(withSnapshots, withSnapshots);

  const resolvedSceneId =
    preferredSceneId && scenes.some((scene) => scene.id === preferredSceneId)
      ? preferredSceneId
      : (scenes[0]?.id ?? null);

  useStageStore.getState().setStage(stage);
  useStageStore.getState().setScenes(scenes);
  useStageStore.setState({ currentSceneId: resolvedSceneId });

  if (saveToIndexedDb) {
    await useStageStore.getState().saveToStorage();
  }

  return { stage, scenes };
}
