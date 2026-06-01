/**
 * @extends-from lib/lecture-timeline.ts
 * @fork-branch feat/html-slide-design-workbench
 */
/**
 * Shared lecture timeline — same speech order and audio identity as PlaybackEngine
 * (scene.actions[] in order; only type === 'speech' with non-empty text).
 * Used by client export prep and server MP4 encoding.
 */

import type { SpeechAction } from '@/lib/types/action';
import type { Scene } from '@/lib/types/stage';

export type LectureRenderMode = 'slide' | 'summary';

export interface LectureSpeechCue {
  kind: 'speech';
  sceneId: string;
  sceneOrder: number;
  sceneType: Scene['type'];
  renderMode: LectureRenderMode;
  actionId: string;
  text: string;
  audioId: string;
  audioUrl?: string;
}

export interface LectureStaticCue {
  kind: 'static';
  sceneId: string;
  sceneOrder: number;
  sceneType: Scene['type'];
  renderMode: LectureRenderMode;
}

export type LectureCue = LectureSpeechCue | LectureStaticCue;

export function canonicalSpeechAudioId(scene: Scene, speech: SpeechAction): string {
  return `tts_s${scene.order}_${speech.id}`;
}

export function renderModeForSceneType(sceneType: Scene['type']): LectureRenderMode {
  return sceneType === 'slide' ? 'slide' : 'summary';
}

export function sortScenesByOrder(scenes: Scene[]): Scene[] {
  return [...scenes].sort((a, b) => a.order - b.order);
}

/** Speech actions in playback order (matches PlaybackEngine actionIndex walk). */
export function getPlaybackSpeechActions(scene: Scene): SpeechAction[] {
  const speeches: SpeechAction[] = [];
  for (const action of scene.actions ?? []) {
    if (action.type === 'speech' && (action as SpeechAction).text) {
      speeches.push(action as SpeechAction);
    }
  }
  return speeches;
}

export function attachCanonicalSpeechAudioIds(scenes: Scene[]): Scene[] {
  return scenes.map((scene) => {
    const actions = scene.actions?.map((action) => {
      if (action.type !== 'speech' || !(action as SpeechAction).text) {
        return action;
      }
      const speech = action as SpeechAction;
      if (speech.audioUrl) {
        return speech;
      }
      const audioId = speech.audioId ?? canonicalSpeechAudioId(scene, speech);
      return { ...speech, audioId };
    });
    return actions ? { ...scene, actions } : scene;
  });
}

/**
 * Build the lecture plan: one speech cue per narration segment, or one static cue
 * when the scene has no speech (hold slide/summary card).
 */
export function buildLecturePlan(scenes: Scene[]): LectureCue[] {
  const cues: LectureCue[] = [];

  for (const scene of sortScenesByOrder(scenes)) {
    const renderMode = renderModeForSceneType(scene.type);
    const speeches = getPlaybackSpeechActions(scene);

    if (speeches.length === 0) {
      cues.push({
        kind: 'static',
        sceneId: scene.id,
        sceneOrder: scene.order,
        sceneType: scene.type,
        renderMode,
      });
      continue;
    }

    for (const speech of speeches) {
      cues.push({
        kind: 'speech',
        sceneId: scene.id,
        sceneOrder: scene.order,
        sceneType: scene.type,
        renderMode,
        actionId: speech.id,
        text: speech.text,
        audioId: speech.audioId ?? canonicalSpeechAudioId(scene, speech),
        audioUrl: speech.audioUrl,
      });
    }
  }

  return cues;
}

export function lecturePlanSpeechCues(plan: LectureCue[]): LectureSpeechCue[] {
  return plan.filter((cue): cue is LectureSpeechCue => cue.kind === 'speech');
}

/** True when any speech cue needs client-uploaded audio (no server audioUrl). */
export function lecturePlanNeedsClientAudio(plan: LectureCue[]): boolean {
  return lecturePlanSpeechCues(plan).some((cue) => !cue.audioUrl);
}

export function scenesNeedClientAudioUpload(scenes: Scene[]): boolean {
  return lecturePlanNeedsClientAudio(buildLecturePlan(scenes));
}

export async function findMissingSpeechAudioSceneIds(
  scenes: Scene[],
  hasResolvableAudio: (cue: LectureSpeechCue) => boolean | Promise<boolean>,
): Promise<string[]> {
  const missing = new Set<string>();
  for (const cue of lecturePlanSpeechCues(buildLecturePlan(scenes))) {
    if (!(await hasResolvableAudio(cue))) {
      missing.add(cue.sceneId);
    }
  }
  return [...missing];
}
