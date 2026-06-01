/**
 * @extends-from lib/course-editor/scene-operations.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import type { QuizQuestion, Scene } from '@/lib/types/stage';

function cloneScene<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

export function normalizeSceneOrder(scenes: Scene[]): Scene[] {
  return scenes.map((scene, index) => ({
    ...scene,
    order: index,
    updatedAt: Date.now(),
  }));
}

export function moveScene(scenes: Scene[], sceneId: string, targetIndex: number): Scene[] {
  const sourceIndex = scenes.findIndex((scene) => scene.id === sceneId);
  if (sourceIndex < 0) return normalizeSceneOrder(scenes);

  const nextScenes = [...scenes];
  const [movedScene] = nextScenes.splice(sourceIndex, 1);
  const safeTargetIndex = Math.max(0, Math.min(targetIndex, nextScenes.length));
  nextScenes.splice(safeTargetIndex, 0, movedScene);
  return normalizeSceneOrder(nextScenes);
}

export function duplicateScene(
  scenes: Scene[],
  sceneId: string,
  createId: () => string,
  buildTitle: (title: string) => string = (title) => `${title} Copy`,
): Scene[] {
  const sourceIndex = scenes.findIndex((scene) => scene.id === sceneId);
  if (sourceIndex < 0) return normalizeSceneOrder(scenes);

  const source = scenes[sourceIndex];
  const copy: Scene = {
    ...cloneScene(source),
    id: createId(),
    title: buildTitle(source.title),
    order: source.order + 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const nextScenes = [...scenes];
  nextScenes.splice(sourceIndex + 1, 0, copy);
  return normalizeSceneOrder(nextScenes);
}

export function updateQuizQuestion(
  scene: Scene,
  questionId: string,
  updates: Partial<QuizQuestion>,
): Scene {
  if (scene.content.type !== 'quiz') return scene;

  return {
    ...scene,
    updatedAt: Date.now(),
    content: {
      ...scene.content,
      questions: scene.content.questions.map((question) =>
        question.id === questionId ? { ...question, ...updates } : question,
      ),
    },
  };
}

export function createBlankQuizQuestion(id: string): QuizQuestion {
  return {
    id,
    type: 'single',
    question: '',
    options: [
      { label: '', value: 'A' },
      { label: '', value: 'B' },
    ],
    answer: [],
    analysis: '',
    hasAnswer: true,
    points: 1,
  };
}
