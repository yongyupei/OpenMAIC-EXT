/**
 * @extends-from lib/teacher/design-shell-reducer.ts
 * @fork-branch feat/html-slide-design-workbench
 */
import type { GenerationMode } from '@/lib/slide-templates/types';
import type { ChapterReferenceFile } from '@/lib/teacher/course-types';
import type {
  GenerationProfile,
  GenerationProfileOverride,
} from '@/lib/teacher/generation-profile';

export interface ChapterDraft {
  id: string;
  title: string;
  learningObjectives: string[];
  summary: string;
  referenceFiles: ChapterReferenceFile[];
  deepSearchEnabled: boolean;
  knowledgeNodeIds: string[];
  slideTemplateId?: string;
  generationMode?: GenerationMode;
  generationProfileOverride?: GenerationProfileOverride;
}

export interface DesignShellState {
  overview: string;
  chapters: ChapterDraft[];
  aiCounter: number;
  slideTemplateId?: string;
  generationMode?: GenerationMode;
  generationProfile?: GenerationProfile;
}

export type ToolEventKind =
  | 'overviewUpdated'
  | 'chapterAdded'
  | 'chapterUpdated'
  | 'chapterRemoved'
  | 'chaptersReordered'
  | 'skipped';

export interface ToolEvent {
  id: string;
  kind: ToolEventKind;
  label?: string;
  reason?: string;
  affectedChapterId?: string;
}

export interface ApplyToolCallResult {
  state: DesignShellState;
  event?: ToolEvent;
}

export interface ToolCallPayload {
  toolName: string;
  input: unknown;
}

export function createDesignShellState(): DesignShellState {
  return { overview: '', chapters: [], aiCounter: 0 };
}

function makeEventId(): string {
  return `evt_${Math.random().toString(36).slice(2, 10)}`;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  if (!value.every((entry) => typeof entry === 'string')) return null;
  return value as string[];
}

export function applyToolCall(state: DesignShellState, call: ToolCallPayload): ApplyToolCallResult {
  if (typeof call.input !== 'object' || call.input === null) {
    return { state, event: { id: makeEventId(), kind: 'skipped', reason: 'invalid input' } };
  }
  const input = call.input as Record<string, unknown>;

  switch (call.toolName) {
    case 'update_overview': {
      const overview = readString(input.overview);
      if (overview === null) {
        return {
          state,
          event: { id: makeEventId(), kind: 'skipped', reason: 'overview must be string' },
        };
      }
      return {
        state: { ...state, overview },
        event: { id: makeEventId(), kind: 'overviewUpdated' },
      };
    }
    case 'add_chapter': {
      const title = readString(input.title);
      const objectives = readStringArray(input.learningObjectives);
      const summary = readString(input.summary);
      if (!title || !objectives || summary === null) {
        return {
          state,
          event: { id: makeEventId(), kind: 'skipped', reason: 'add_chapter missing fields' },
        };
      }
      const afterId = readString(input.afterChapterId);
      const nextCounter = state.aiCounter + 1;
      const newChapter: ChapterDraft = {
        id: `ai-${nextCounter}`,
        title,
        learningObjectives: objectives,
        summary,
        referenceFiles: [],
        deepSearchEnabled: false,
        knowledgeNodeIds: [],
      };
      let chapters: ChapterDraft[];
      if (afterId) {
        const idx = state.chapters.findIndex((chapter) => chapter.id === afterId);
        if (idx === -1) {
          chapters = [...state.chapters, newChapter];
        } else {
          chapters = [
            ...state.chapters.slice(0, idx + 1),
            newChapter,
            ...state.chapters.slice(idx + 1),
          ];
        }
      } else {
        chapters = [...state.chapters, newChapter];
      }
      return {
        state: { ...state, chapters, aiCounter: nextCounter },
        event: {
          id: makeEventId(),
          kind: 'chapterAdded',
          label: title,
          affectedChapterId: newChapter.id,
        },
      };
    }
    case 'update_chapter': {
      const chapterId = readString(input.chapterId);
      const patch = input.patch as Record<string, unknown> | undefined;
      if (!chapterId || typeof patch !== 'object' || patch === null) {
        return {
          state,
          event: { id: makeEventId(), kind: 'skipped', reason: 'update_chapter missing fields' },
        };
      }
      const idx = state.chapters.findIndex((chapter) => chapter.id === chapterId);
      if (idx === -1) {
        return {
          state,
          event: { id: makeEventId(), kind: 'skipped', reason: `unknown chapter ${chapterId}` },
        };
      }
      const current = state.chapters[idx];
      const nextChapter: ChapterDraft = { ...current };
      if (typeof patch.title === 'string') nextChapter.title = patch.title;
      const objectives = readStringArray(patch.learningObjectives);
      if (objectives) nextChapter.learningObjectives = objectives;
      if (typeof patch.summary === 'string') nextChapter.summary = patch.summary;
      if (typeof patch.deepSearchEnabled === 'boolean') {
        nextChapter.deepSearchEnabled = patch.deepSearchEnabled;
      }
      const chapters = [...state.chapters];
      chapters[idx] = nextChapter;
      return {
        state: { ...state, chapters },
        event: {
          id: makeEventId(),
          kind: 'chapterUpdated',
          label: nextChapter.title,
          affectedChapterId: chapterId,
        },
      };
    }
    case 'remove_chapter': {
      const chapterId = readString(input.chapterId);
      if (!chapterId) {
        return {
          state,
          event: { id: makeEventId(), kind: 'skipped', reason: 'remove_chapter missing id' },
        };
      }
      const target = state.chapters.find((chapter) => chapter.id === chapterId);
      if (!target) {
        return {
          state,
          event: { id: makeEventId(), kind: 'skipped', reason: `unknown chapter ${chapterId}` },
        };
      }
      return {
        state: {
          ...state,
          chapters: state.chapters.filter((chapter) => chapter.id !== chapterId),
        },
        event: {
          id: makeEventId(),
          kind: 'chapterRemoved',
          label: target.title,
          affectedChapterId: chapterId,
        },
      };
    }
    case 'reorder_chapters': {
      const order = readStringArray(input.order);
      if (!order || order.length !== state.chapters.length) {
        return {
          state,
          event: { id: makeEventId(), kind: 'skipped', reason: 'order mismatch' },
        };
      }
      const map = new Map(state.chapters.map((chapter) => [chapter.id, chapter]));
      const reordered: ChapterDraft[] = [];
      for (const id of order) {
        const chapter = map.get(id);
        if (!chapter) {
          return {
            state,
            event: { id: makeEventId(), kind: 'skipped', reason: `unknown id ${id} in order` },
          };
        }
        reordered.push(chapter);
      }
      return {
        state: { ...state, chapters: reordered },
        event: { id: makeEventId(), kind: 'chaptersReordered' },
      };
    }
    default:
      return {
        state,
        event: { id: makeEventId(), kind: 'skipped', reason: `unknown tool ${call.toolName}` },
      };
  }
}
